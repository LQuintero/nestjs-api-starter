import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import {
  IdempotencyStore,
  ReserveResult,
} from './storage/idempotency-store.interface';

interface MockRequest {
  method: string;
  path: string;
  ip?: string;
  body?: unknown;
  headers: Record<string, string | undefined>;
  user?: { id: string };
}

interface MockResponse {
  statusCode?: number;
  status?: jest.Mock;
  setHeader?: jest.Mock;
  getHeaders?: jest.Mock;
}

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let reflector: { getAllAndOverride: jest.Mock };
  let store: { reserve: jest.Mock; complete: jest.Mock; release: jest.Mock };
  let config: { get: jest.Mock };

  const TTL_SECONDS = 3600;

  const buildContext = (
    request: MockRequest,
    response: MockResponse = {},
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    }) as unknown as ExecutionContext;

  const buildHandler = (observable: Observable<unknown>): CallHandler =>
    ({ handle: jest.fn(() => observable) }) as unknown as CallHandler;

  const reserveResult = (result: ReserveResult): void => {
    store.reserve.mockResolvedValue(result);
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    store = {
      reserve: jest.fn(),
      complete: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'app.idempotencyTtlSeconds' ? TTL_SECONDS : undefined,
      ),
    };

    interceptor = new IdempotencyInterceptor(
      reflector as unknown as Reflector,
      store as unknown as IdempotencyStore,
      config as unknown as ConfigService,
    );
  });

  it('passes through untouched when the route is not annotated', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const handler = buildHandler(of('ok'));

    const result$ = await interceptor.intercept(
      buildContext({ method: 'POST', path: '/things', headers: {} }),
      handler,
    );

    await expect(lastValueFrom(result$)).resolves.toBe('ok');
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it('requires Idempotency-Key when route metadata requires it', async () => {
    const handler = buildHandler(of('ok'));

    await expect(
      interceptor.intercept(
        buildContext({ method: 'POST', path: '/things', headers: {} }),
        handler,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(handler.handle).not.toHaveBeenCalled();
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it('replays a completed response with its status and headers', async () => {
    reserveResult({
      kind: 'replay',
      responseStatus: 201,
      responseBody: { id: 'thing_1' },
      responseHeaders: { location: '/things/thing_1' },
    });
    const setStatus = jest.fn();
    const setHeader = jest.fn();
    const handler = buildHandler(of('fresh'));

    const result$ = await interceptor.intercept(
      buildContext(
        {
          method: 'POST',
          path: '/things',
          headers: { 'idempotency-key': 'key-123' },
        },
        { status: setStatus, setHeader },
      ),
      handler,
    );

    await expect(lastValueFrom(result$)).resolves.toEqual({ id: 'thing_1' });
    expect(handler.handle).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(201);
    expect(setHeader).toHaveBeenCalledWith('location', '/things/thing_1');
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('finalizes a successful response with TTL and captured headers', async () => {
    reserveResult({ kind: 'started' });
    const body = { id: 'thing_1' };
    const handler = buildHandler(of(body));

    const result$ = await interceptor.intercept(
      buildContext(
        {
          method: 'POST',
          path: '/things',
          headers: { 'idempotency-key': 'key-123' },
        },
        {
          statusCode: 201,
          getHeaders: jest.fn(() => ({ 'x-trace': 'abc' })),
        },
      ),
      handler,
    );

    await expect(lastValueFrom(result$)).resolves.toEqual(body);
    expect(store.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'key-123',
        method: 'POST',
        path: '/things',
        ttlSeconds: TTL_SECONDS,
        requestHash: expect.any(String),
      }),
    );
    expect(store.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'key-123',
        method: 'POST',
        path: '/things',
        responseStatus: 201,
        responseBody: body,
        responseHeaders: { 'x-trace': 'abc' },
      }),
    );
    expect(store.release).not.toHaveBeenCalled();
  });

  it('does not complete on thrown errors and releases the reservation', async () => {
    reserveResult({ kind: 'started' });
    const failure = new Error('boom');
    const handler = buildHandler(throwError(() => failure));

    const result$ = await interceptor.intercept(
      buildContext(
        {
          method: 'POST',
          path: '/things',
          headers: { 'idempotency-key': 'key-123' },
        },
        { statusCode: 500 },
      ),
      handler,
    );

    await expect(lastValueFrom(result$)).rejects.toBe(failure);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.release).toHaveBeenCalledWith({
      key: 'key-123',
      method: 'POST',
      path: '/things',
      scope: 'anonymous:unknown',
    });
  });

  it('returns 409 and skips the handler when a duplicate is in progress', async () => {
    reserveResult({ kind: 'in_progress' });
    const handler = buildHandler(of('fresh'));

    await expect(
      interceptor.intercept(
        buildContext({
          method: 'POST',
          path: '/things',
          headers: { 'idempotency-key': 'key-123' },
        }),
        handler,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(handler.handle).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('returns 409 and skips the handler when the key was used with a different request', async () => {
    reserveResult({ kind: 'conflict' });
    const handler = buildHandler(of('fresh'));

    await expect(
      interceptor.intercept(
        buildContext({
          method: 'POST',
          path: '/things',
          body: { amount: 999 },
          headers: { 'idempotency-key': 'key-123' },
        }),
        handler,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('uses user scope for authenticated requests and anonymous IP scope otherwise', async () => {
    reserveResult({ kind: 'started' });

    const authed$ = await interceptor.intercept(
      buildContext(
        {
          method: 'POST',
          path: '/things',
          headers: { 'idempotency-key': 'key-123' },
          user: { id: 'user_42' },
        },
        { statusCode: 200 },
      ),
      buildHandler(of('a')),
    );
    await lastValueFrom(authed$);

    expect(store.reserve).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'user:user_42' }),
    );

    const anon$ = await interceptor.intercept(
      buildContext(
        {
          method: 'POST',
          path: '/things',
          ip: '203.0.113.7',
          headers: { 'idempotency-key': 'key-456' },
        },
        { statusCode: 200 },
      ),
      buildHandler(of('b')),
    );
    await lastValueFrom(anon$);

    expect(store.reserve).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'anonymous:203.0.113.7' }),
    );
  });

  it('derives a different request hash for the same key with a different body', async () => {
    reserveResult({ kind: 'started' });

    const run = async (body: unknown): Promise<string> => {
      const result$ = await interceptor.intercept(
        buildContext(
          {
            method: 'POST',
            path: '/things',
            body,
            headers: { 'idempotency-key': 'key-123' },
          },
          { statusCode: 200 },
        ),
        buildHandler(of('x')),
      );
      await lastValueFrom(result$);
      const calls = store.reserve.mock.calls;
      return calls[calls.length - 1][0].requestHash as string;
    };

    const hashA = await run({ amount: 100 });
    const hashB = await run({ amount: 200 });
    const hashAAgain = await run({ amount: 100 });

    expect(hashA).not.toEqual(hashB);
    expect(hashA).toEqual(hashAAgain);
  });
});
