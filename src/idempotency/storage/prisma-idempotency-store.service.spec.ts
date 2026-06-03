import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaIdempotencyStoreService } from './prisma-idempotency-store.service';
import { IdempotencyIdentity } from './idempotency-store.interface';

const identity: IdempotencyIdentity = {
  key: 'key-123',
  method: 'POST',
  path: '/things',
  scope: 'user:user_1',
};

const uniqueViolation = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('PrismaIdempotencyStoreService', () => {
  let service: PrismaIdempotencyStoreService;
  let prisma: {
    idempotencyKey: {
      deleteMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      idempotencyKey: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new PrismaIdempotencyStoreService(
      prisma as unknown as PrismaService,
    );
  });

  it('reclaims expired rows before reserving and starts when none exists', async () => {
    prisma.idempotencyKey.findFirst.mockResolvedValue(null);
    prisma.idempotencyKey.create.mockResolvedValue({});

    const result = await service.reserve({
      ...identity,
      requestHash: 'hash-a',
      ttlSeconds: 60,
    });

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { ...identity, expiresAt: { lte: expect.any(Date) } },
    });
    expect(prisma.idempotencyKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...identity,
        requestHash: 'hash-a',
        status: 'PENDING',
        expiresAt: expect.any(Date),
      }),
    });
    expect(result).toEqual({ kind: 'started' });
  });

  it('replays a completed record with a matching request hash', async () => {
    prisma.idempotencyKey.findFirst.mockResolvedValue({
      requestHash: 'hash-a',
      status: 'COMPLETED',
      responseStatus: 201,
      responseBody: { id: 'thing_1' },
      responseHeaders: { location: '/things/thing_1' },
    });

    const result = await service.reserve({
      ...identity,
      requestHash: 'hash-a',
      ttlSeconds: 60,
    });

    expect(result).toEqual({
      kind: 'replay',
      responseStatus: 201,
      responseBody: { id: 'thing_1' },
      responseHeaders: { location: '/things/thing_1' },
    });
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it('reports in_progress for a pending record with a matching request hash', async () => {
    prisma.idempotencyKey.findFirst.mockResolvedValue({
      requestHash: 'hash-a',
      status: 'PENDING',
      responseStatus: null,
      responseBody: null,
      responseHeaders: null,
    });

    const result = await service.reserve({
      ...identity,
      requestHash: 'hash-a',
      ttlSeconds: 60,
    });

    expect(result).toEqual({ kind: 'in_progress' });
  });

  it('reports a conflict when the stored request hash differs', async () => {
    prisma.idempotencyKey.findFirst.mockResolvedValue({
      requestHash: 'hash-other',
      status: 'COMPLETED',
      responseStatus: 200,
      responseBody: {},
      responseHeaders: null,
    });

    const result = await service.reserve({
      ...identity,
      requestHash: 'hash-a',
      ttlSeconds: 60,
    });

    expect(result).toEqual({ kind: 'conflict' });
  });

  it('resolves a concurrent create (P2002) by re-reading the winning row', async () => {
    prisma.idempotencyKey.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        requestHash: 'hash-a',
        status: 'PENDING',
        responseStatus: null,
        responseBody: null,
        responseHeaders: null,
      });
    prisma.idempotencyKey.create.mockRejectedValue(uniqueViolation());

    const result = await service.reserve({
      ...identity,
      requestHash: 'hash-a',
      ttlSeconds: 60,
    });

    expect(result).toEqual({ kind: 'in_progress' });
    expect(prisma.idempotencyKey.findFirst).toHaveBeenCalledTimes(2);
  });

  it('finalizes a reservation by marking it completed', async () => {
    await service.complete({
      ...identity,
      responseStatus: 201,
      responseBody: { id: 'thing_1' },
      responseHeaders: { 'x-trace': 'abc' },
    });

    expect(prisma.idempotencyKey.updateMany).toHaveBeenCalledWith({
      where: identity,
      data: {
        status: 'COMPLETED',
        responseStatus: 201,
        responseBody: { id: 'thing_1' },
        responseHeaders: { 'x-trace': 'abc' },
      },
    });
  });

  it('releases only pending reservations', async () => {
    await service.release(identity);

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { ...identity, status: 'PENDING' },
    });
  });
});
