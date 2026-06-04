import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaTokenStorageService } from './prisma-token-storage.service';

const digest = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

describe('PrismaTokenStorageService', () => {
  let service: PrismaTokenStorageService;
  let tx: {
    refreshToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };
  let prisma: {
    refreshToken: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const storedRow = {
    id: 'token_1',
    userId: 'user_1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };

  beforeEach(() => {
    tx = {
      refreshToken: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    prisma = {
      refreshToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };

    service = new PrismaTokenStorageService(prisma as unknown as PrismaService);
  });

  it('stores the SHA-256 digest of the token on create', async () => {
    prisma.refreshToken.create.mockResolvedValue(storedRow);

    await service.create({
      userId: 'user_1',
      token: 'opaque-token',
      expiresAt: storedRow.expiresAt,
    });

    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        tokenHash: digest('opaque-token'),
        expiresAt: storedRow.expiresAt,
      },
    });
  });

  it('finds a valid token by exact indexed tokenHash lookup (no scan)', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(storedRow);

    const result = await service.findValid('opaque-token');

    expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: digest('opaque-token'),
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(result).toEqual(storedRow);
  });

  it('returns null when no matching valid token exists', async () => {
    prisma.refreshToken.findFirst.mockResolvedValue(null);

    await expect(service.findValid('missing')).resolves.toBeNull();
  });

  it('finds a reused revoked token by digest so its user can be invalidated', async () => {
    const revokedRow = {
      ...storedRow,
      revokedAt: new Date(),
    };
    prisma.refreshToken.findFirst.mockResolvedValue(revokedRow);

    const result = await service.findRevoked('rotated-token');

    expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
      where: {
        tokenHash: digest('rotated-token'),
        revokedAt: { not: null },
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(result).toEqual(revokedRow);
  });

  it('rotates by conditionally revoking the current digest and creating a successor', async () => {
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.findUniqueOrThrow.mockResolvedValue({ userId: 'user_1' });
    const expiresAt = new Date(Date.now() + 120_000);
    tx.refreshToken.create.mockResolvedValue({
      id: 'token_2',
      userId: 'user_1',
      expiresAt,
      revokedAt: null,
    });

    const result = await service.rotate({
      currentToken: 'old-token',
      nextToken: 'new-token',
      expiresAt,
    });

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: digest('old-token'),
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        tokenHash: digest('new-token'),
        expiresAt,
      },
    });
    expect(result).toEqual({
      id: 'token_2',
      userId: 'user_1',
      expiresAt,
      revokedAt: null,
    });
  });

  it('rejects a concurrent replay (conditional revoke matches no row) without creating a successor', async () => {
    // A racing refresh already revoked the row, so the conditional update
    // touches zero rows.
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.rotate({
        currentToken: 'old-token',
        nextToken: 'new-token',
        expiresAt: new Date(Date.now() + 120_000),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(tx.refreshToken.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('revokes only the token matching both digest and userId', async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await service.revoke('old-token', 'user_1');

    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: digest('old-token'), revokedAt: null, userId: 'user_1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes all unrevoked tokens for a user', async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await service.revokeAllForUser('user_1');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
