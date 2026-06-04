import { randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService, type UserProfile } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import {
  TOKEN_STORAGE,
  type TokenStorageService,
} from './storage/token-storage.interface';

const BCRYPT_COST = 12;
const DEFAULT_USER_ROLE = 'user';
const REFRESH_TOKEN_BYTES = 48;

interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

const MS_PER_SECOND = 1_000;
const TTL_UNIT_MS: Record<string, number> = {
  s: MS_PER_SECOND,
  m: 60 * MS_PER_SECOND,
  h: 3_600 * MS_PER_SECOND,
  d: 86_400 * MS_PER_SECOND,
};

// Parses simple TTL strings (`7d`, `15m`, `60s`) or bare numbers (seconds) into
// milliseconds so the refresh token expiry can be derived from config.
function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(ttl.trim());

  if (!match) {
    throw new Error(`Invalid refresh TTL: "${ttl}".`);
  }

  const amount = Number(match[1]);
  const unitMs = TTL_UNIT_MS[match[2] ?? 's'] ?? MS_PER_SECOND;

  return amount * unitMs;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(TOKEN_STORAGE)
    private readonly tokenStorage: TokenStorageService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      roleName: DEFAULT_USER_ROLE,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
    });

    return this.issueTokenPair(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.issueTokenPair(user.id, user.email);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    const stored = await this.tokenStorage.findValid(dto.refreshToken);

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const user = await this.usersService.findById(stored.userId);

    if (!user?.isActive) {
      throw new UnauthorizedException('Account is inactive.');
    }

    const nextToken = this.generateRefreshToken();

    // Sign the access token before rotating so a signing failure never leaves
    // the client with a rotated-but-undelivered refresh token.
    const accessToken = await this.signAccessToken(user.id, user.email);

    await this.tokenStorage.rotate({
      currentToken: dto.refreshToken,
      nextToken,
      expiresAt: this.refreshTokenExpiry(),
    });

    return { accessToken, refreshToken: nextToken };
  }

  async logout(refreshToken: string, userId: string): Promise<void> {
    await this.tokenStorage.revoke(refreshToken, userId);
  }

  me(userId: string): Promise<UserProfile> {
    return this.usersService.getCurrentUser(userId);
  }

  private async issueTokenPair(
    userId: string,
    email: string,
  ): Promise<AuthResponseDto> {
    const refreshToken = this.generateRefreshToken();
    await this.tokenStorage.create({
      userId,
      token: refreshToken,
      expiresAt: this.refreshTokenExpiry(),
    });

    const accessToken = await this.signAccessToken(userId, email);

    return { accessToken, refreshToken };
  }

  private signAccessToken(userId: string, email: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: userId,
      email,
      type: 'access',
    };

    return this.jwtService.signAsync(payload);
  }

  private generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  private refreshTokenExpiry(): Date {
    const ttl = this.configService.get<string>('auth.jwtRefreshTtl') ?? '7d';
    return new Date(Date.now() + parseTtlToMs(ttl));
  }
}
