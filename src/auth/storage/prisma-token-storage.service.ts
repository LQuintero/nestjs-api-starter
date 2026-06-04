import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateRefreshTokenInput,
  RotateRefreshTokenInput,
  StoredRefreshToken,
  TokenStorageService,
} from './token-storage.interface';

@Injectable()
export class PrismaTokenStorageService implements TokenStorageService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRefreshTokenInput): Promise<StoredRefreshToken> {
    const record = await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: this.digestToken(input.token),
        expiresAt: input.expiresAt,
      },
    });

    return this.toStored(record);
  }

  /**
   * Refresh tokens are high-entropy opaque strings (48 random bytes), so a
   * deterministic SHA-256 digest at rest is safe and lets us look a token up
   * directly by the unique `tokenHash` column. This is an indexed O(1) lookup
   * with no scans and no per-candidate hashing, which avoids CPU-heavy
   * unauthenticated refresh attempts. Redis remains the recommended high-volume
   * upgrade, but the Prisma default uses this indexed digest lookup.
   */
  async findValid(token: string): Promise<StoredRefreshToken | null> {
    const record = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash: this.digestToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return record ? this.toStored(record) : null;
  }

  async findRevoked(token: string): Promise<StoredRefreshToken | null> {
    const record = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash: this.digestToken(token),
        revokedAt: { not: null },
        expiresAt: { gt: new Date() },
      },
    });

    return record ? this.toStored(record) : null;
  }

  async rotate(input: RotateRefreshTokenInput): Promise<StoredRefreshToken> {
    const currentHash = this.digestToken(input.currentToken);

    return this.prisma.$transaction(async (tx) => {
      // Conditional revocation closes the replay race: two concurrent refreshes
      // target the same digest, but only the request whose `updateMany` flips an
      // unrevoked/unexpired row (count === 1) is allowed to mint a successor.
      // The loser sees count === 0 and is rejected without creating a token.
      // Running both statements in one transaction also rolls back the
      // revocation if the successor insert fails.
      const revoked = await tx.refreshToken.updateMany({
        where: {
          tokenHash: currentHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });

      if (revoked.count !== 1) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      // The row was just revoked above; read it back (indexed unique lookup) to
      // carry the owning user onto the successor token.
      const current = await tx.refreshToken.findUniqueOrThrow({
        where: { tokenHash: currentHash },
        select: { userId: true },
      });

      const created = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: this.digestToken(input.nextToken),
          expiresAt: input.expiresAt,
        },
      });

      return this.toStored(created);
    });
  }

  async revoke(token: string, userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.digestToken(token), revokedAt: null, userId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Deterministic digest so a given opaque token always maps to the same
  // indexed `tokenHash` value. Safe here because the token itself is
  // high-entropy random data, not a low-entropy secret like a password.
  private digestToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toStored(record: {
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }): StoredRefreshToken {
    return {
      id: record.id,
      userId: record.userId,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
    };
  }
}
