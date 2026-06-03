import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CompleteIdempotencyInput,
  IdempotencyIdentity,
  IdempotencyStore,
  ReserveIdempotencyInput,
  ReserveResult,
} from './idempotency-store.interface';

const STATUS_PENDING = 'PENDING';
const STATUS_COMPLETED = 'COMPLETED';

interface IdempotencyRecord {
  requestHash: string;
  status: string;
  responseStatus: number | null;
  responseBody: Prisma.JsonValue | null;
  responseHeaders: Prisma.JsonValue | null;
}

// Production note: Redis is the recommended high-throughput backing store for
// idempotency records because it provides native TTL cleanup and keeps these
// hot-path lookups out of the relational database. The reserve step maps to a
// `SET key val NX EX ttl` (atomic claim) and complete maps to a follow-up write.
@Injectable()
export class PrismaIdempotencyStoreService implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: ReserveIdempotencyInput): Promise<ReserveResult> {
    const identity = this.toIdentity(input);

    // Reclaim an expired slot first so a stale unique row never blocks reuse
    // (the previous get/set design left expired rows that caused P2002 with no
    // fresh record being written).
    await this.prisma.idempotencyKey.deleteMany({
      where: { ...identity, expiresAt: { lte: new Date() } },
    });

    const existing = await this.findValid(identity);

    if (existing) {
      return this.classify(existing, input.requestHash);
    }

    try {
      await this.prisma.idempotencyKey.create({
        data: {
          ...identity,
          requestHash: input.requestHash,
          status: STATUS_PENDING,
          expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
        },
      });

      return { kind: 'started' };
    } catch (error) {
      // The unique [key, method, path, scope] constraint is the atomic gate:
      // only one concurrent duplicate creates the PENDING row. The loser hits
      // P2002, re-reads the winning row, and reports replay/in_progress/conflict
      // instead of executing the side effect a second time.
      if (this.isUniqueViolation(error)) {
        const racer = await this.findValid(identity);

        if (racer) {
          return this.classify(racer, input.requestHash);
        }
      }

      throw error;
    }
  }

  async complete(input: CompleteIdempotencyInput): Promise<void> {
    // updateMany (not update) so a reservation reclaimed by TTL cleanup does not
    // throw P2025; there is simply nothing to finalize in that rare case.
    await this.prisma.idempotencyKey.updateMany({
      where: this.toIdentity(input),
      data: {
        status: STATUS_COMPLETED,
        responseStatus: input.responseStatus,
        responseBody: this.toJson(input.responseBody),
        responseHeaders: this.toJson(input.responseHeaders),
      },
    });
  }

  async release(input: IdempotencyIdentity): Promise<void> {
    // Only pending reservations are released so a completed, replayable record
    // is never deleted by a late-arriving error path.
    await this.prisma.idempotencyKey.deleteMany({
      where: { ...this.toIdentity(input), status: STATUS_PENDING },
    });
  }

  private findValid(
    identity: IdempotencyIdentity,
  ): Promise<IdempotencyRecord | null> {
    return this.prisma.idempotencyKey.findFirst({
      where: { ...identity, expiresAt: { gt: new Date() } },
      select: {
        requestHash: true,
        status: true,
        responseStatus: true,
        responseBody: true,
        responseHeaders: true,
      },
    });
  }

  private classify(
    record: IdempotencyRecord,
    requestHash: string,
  ): ReserveResult {
    if (record.requestHash !== requestHash) {
      return { kind: 'conflict' };
    }

    if (record.status === STATUS_COMPLETED) {
      return {
        kind: 'replay',
        responseStatus: record.responseStatus ?? 200,
        responseBody: record.responseBody ?? null,
        responseHeaders: this.toHeaders(record.responseHeaders),
      };
    }

    return { kind: 'in_progress' };
  }

  private toIdentity(input: IdempotencyIdentity): IdempotencyIdentity {
    return {
      key: input.key,
      method: input.method,
      path: input.path,
      scope: input.scope,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value === undefined || value === null
      ? Prisma.JsonNull
      : (value as Prisma.InputJsonValue);
  }

  private toHeaders(
    value: Prisma.JsonValue | null,
  ): Record<string, string> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, string>;
    }

    return undefined;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
