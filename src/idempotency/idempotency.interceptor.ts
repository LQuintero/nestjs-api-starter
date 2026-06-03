import { createHash } from 'node:crypto';
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { catchError, from, mergeMap, Observable, of, throwError } from 'rxjs';
import { REQUIRE_IDEMPOTENCY_KEY } from '../common/decorators/require-idempotency.decorator';
import {
  IDEMPOTENCY_STORE,
  IdempotencyIdentity,
  IdempotencyStore,
  ReserveResult,
} from './storage/idempotency-store.interface';

const DEFAULT_TTL_SECONDS = 86_400;

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
    private readonly configService: ConfigService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_IDEMPOTENCY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = this.extractKey(request);

    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }

    const identity: IdempotencyIdentity = {
      key,
      method: request.method,
      path: request.path,
      scope: this.computeScope(request),
    };
    const requestHash = this.computeRequestHash(request);
    const ttlSeconds =
      this.configService.get<number>('app.idempotencyTtlSeconds') ??
      DEFAULT_TTL_SECONDS;

    // Reserve atomically BEFORE running the handler so concurrent duplicates
    // cannot both execute side effects. Only a `started` reservation proceeds.
    const reservation = await this.store.reserve({
      ...identity,
      requestHash,
      ttlSeconds,
    });

    if (reservation.kind === 'replay') {
      return this.replay(context, reservation);
    }

    if (reservation.kind === 'in_progress') {
      throw new ConflictException(
        'A request with this Idempotency-Key is already in progress.',
      );
    }

    if (reservation.kind === 'conflict') {
      throw new ConflictException(
        'Idempotency-Key was already used with a different request.',
      );
    }

    return next.handle().pipe(
      mergeMap((responseBody) => {
        const response = context.switchToHttp().getResponse<Response>();

        return from(
          this.store.complete({
            ...identity,
            responseStatus: response?.statusCode ?? 200,
            responseBody,
            responseHeaders: this.captureHeaders(response),
          }),
        ).pipe(mergeMap(() => of(responseBody)));
      }),
      // On failure (handler or finalize) release the pending reservation so a
      // retry can run again, then rethrow the original error untouched.
      catchError((error: unknown) =>
        from(this.store.release(identity)).pipe(
          catchError(() => of(undefined)),
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  private replay(
    context: ExecutionContext,
    reservation: Extract<ReserveResult, { kind: 'replay' }>,
  ): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response?.status?.(reservation.responseStatus);

    if (reservation.responseHeaders && typeof response?.setHeader === 'function') {
      for (const [name, value] of Object.entries(reservation.responseHeaders)) {
        response.setHeader(name, value);
      }
    }

    return of(reservation.responseBody);
  }

  private extractKey(request: Request): string | undefined {
    const header = request.headers['idempotency-key'];
    return Array.isArray(header) ? header[0] : header;
  }

  // Anonymous callers are scoped by IP rather than a single global bucket so
  // one client's key cannot collide with or block another's.
  private computeScope(request: AuthenticatedRequest): string {
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    return `anonymous:${request.ip ?? 'unknown'}`;
  }

  // SHA-256 over method, path, and a stably-stringified body so a key reused
  // with different parameters is detected as a conflict. Undefined body hashes
  // as null.
  private computeRequestHash(request: Request): string {
    const fingerprint = stableStringify({
      method: request.method,
      path: request.path,
      body: request.body ?? null,
    });

    return createHash('sha256').update(fingerprint).digest('hex');
  }

  private captureHeaders(
    response: Response | undefined,
  ): Record<string, string> | undefined {
    if (typeof response?.getHeaders !== 'function') {
      return undefined;
    }

    const headers: Record<string, string> = {};

    for (const [name, value] of Object.entries(response.getHeaders())) {
      if (value === undefined) {
        continue;
      }

      headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  }
}

// Deterministic JSON serialization with recursively sorted object keys so two
// requests with the same data but different key ordering hash identically.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          (value as Record<string, unknown>)[key],
        )}`,
    );

  return `{${entries.join(',')}}`;
}
