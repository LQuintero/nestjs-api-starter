export interface CreateRefreshTokenInput {
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface RotateRefreshTokenInput {
  currentToken: string;
  nextToken: string;
  expiresAt: Date;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export const TOKEN_STORAGE = Symbol('TOKEN_STORAGE');

/**
 * Storage abstraction for refresh tokens.
 *
 * Refresh token reads and writes are on the auth hot path (every login,
 * refresh, and logout). This interface keeps the backing store swappable:
 * the default is a Prisma/Postgres implementation, but teams can drop in a
 * Redis-backed implementation for high refresh volume without touching any
 * auth service logic.
 */
export interface TokenStorageService {
  create(input: CreateRefreshTokenInput): Promise<StoredRefreshToken>;
  findValid(token: string): Promise<StoredRefreshToken | null>;
  findRevoked(token: string): Promise<StoredRefreshToken | null>;
  rotate(input: RotateRefreshTokenInput): Promise<StoredRefreshToken>;
  revoke(token: string, userId: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}
