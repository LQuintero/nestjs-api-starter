import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { TokenStorageService } from './storage/token-storage.interface';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const hashMock = bcrypt.hash as unknown as jest.Mock;
const compareMock = bcrypt.compare as unknown as jest.Mock;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    createUser: jest.Mock;
    findByEmail: jest.Mock;
    findById: jest.Mock;
    getCurrentUser: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let tokenStorage: jest.Mocked<TokenStorageService>;

  beforeEach(() => {
    usersService = {
      createUser: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      getCurrentUser: jest.fn(),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('access-token') };
    configService = { get: jest.fn().mockReturnValue('7d') };
    tokenStorage = {
      create: jest.fn().mockResolvedValue(undefined),
      findValid: jest.fn(),
      findRevoked: jest.fn(),
      rotate: jest.fn().mockResolvedValue(undefined),
      revoke: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      usersService as never,
      jwtService as never,
      configService as never,
      tokenStorage,
    );

    hashMock.mockResolvedValue('hashed-password');
    compareMock.mockResolvedValue(true);
  });

  it('registers a user and assigns the default user role', async () => {
    usersService.createUser.mockResolvedValue({
      id: 'user_1',
      email: 'new@example.com',
      passwordHash: 'hashed-password',
      isActive: true,
    });

    const result = await service.register({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    });

    expect(hashMock).toHaveBeenCalledWith('password123', 12);
    expect(usersService.createUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      passwordHash: 'hashed-password',
      name: 'New User',
      roleName: 'user',
    });
    expect(tokenStorage.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_1' }),
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: expect.any(String),
    });
  });

  it('logs in with valid credentials and creates a refresh token', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      passwordHash: 'stored-hash',
      isActive: true,
    });

    const result = await service.login({
      email: 'user@example.com',
      password: 'password123',
    });

    expect(compareMock).toHaveBeenCalledWith('password123', 'stored-hash');
    expect(tokenStorage.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_1' }),
    );
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  it('rejects inactive users during login', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      passwordHash: 'stored-hash',
      isActive: false,
    });

    await expect(
      service.login({ email: 'user@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenStorage.create).not.toHaveBeenCalled();
  });

  it('rejects login with an invalid password', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      passwordHash: 'stored-hash',
      isActive: true,
    });
    compareMock.mockResolvedValue(false);

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenStorage.create).not.toHaveBeenCalled();
  });

  it('rotates refresh tokens', async () => {
    tokenStorage.findValid.mockResolvedValue({
      id: 'token_1',
      userId: 'user_1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    usersService.findById.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      passwordHash: 'stored-hash',
      isActive: true,
    });

    const result = await service.refresh({ refreshToken: 'old-token' });

    expect(tokenStorage.rotate).toHaveBeenCalledWith(
      expect.objectContaining({
        currentToken: 'old-token',
        nextToken: expect.any(String),
      }),
    );
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe('old-token');
  });

  it('rejects refresh when the stored token is invalid', async () => {
    tokenStorage.findValid.mockResolvedValue(null);
    tokenStorage.findRevoked.mockResolvedValue(null);

    await expect(
      service.refresh({ refreshToken: 'missing' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenStorage.rotate).not.toHaveBeenCalled();
  });

  it('revokes all user tokens when a revoked refresh token is reused', async () => {
    tokenStorage.findValid.mockResolvedValue(null);
    tokenStorage.findRevoked.mockResolvedValue({
      id: 'token_1',
      userId: 'user_1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expect(
      service.refresh({ refreshToken: 'rotated-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(tokenStorage.revokeAllForUser).toHaveBeenCalledWith('user_1');
    expect(tokenStorage.rotate).not.toHaveBeenCalled();
  });

  it('logout passes userId to tokenStorage so only the caller can revoke their own token', async () => {
    await service.logout('some-refresh-token', 'user_1');

    expect(tokenStorage.revoke).toHaveBeenCalledWith('some-refresh-token', 'user_1');
  });

  it('returns Invalid credentials for inactive accounts to prevent enumeration', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      passwordHash: 'stored-hash',
      isActive: false,
    });

    const error = await service
      .login({ email: 'user@example.com', password: 'password123' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe('Invalid credentials.');
  });

  it('does not rotate the refresh token if access token signing fails', async () => {
    tokenStorage.findValid.mockResolvedValue({
      id: 'token_1',
      userId: 'user_1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    usersService.findById.mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      passwordHash: 'stored-hash',
      isActive: true,
    });
    jwtService.signAsync.mockRejectedValue(new Error('signing failed'));

    await expect(service.refresh({ refreshToken: 'old-token' })).rejects.toThrow(
      'signing failed',
    );

    expect(tokenStorage.rotate).not.toHaveBeenCalled();
  });
});
