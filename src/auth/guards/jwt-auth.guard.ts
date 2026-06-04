import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthenticatedRequestUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../../users/users.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface AccessTokenPayload {
  sub?: string;
  email?: string;
  type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedRequestUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('auth.jwtAccessSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type.');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token.');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user?.isActive) {
      throw new UnauthorizedException('Account is inactive.');
    }

    request.user = { id: user.id, email: user.email };

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;

    if (!header) {
      return null;
    }

    const [scheme, value] = header.split(' ');

    if (scheme !== 'Bearer' || !value) {
      return null;
    }

    return value;
  }
}
