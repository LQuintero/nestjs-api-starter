import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../roles/decorators/roles.decorator';
import { RolesService } from '../../roles/roles.service';

interface RequestWithUser {
  user?: { id: string };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<
      string[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const activeRoles = await this.rolesService.findUserRoleNames(user.id);
    const hasRequiredRole = requiredRoles.some((role) =>
      activeRoles.includes(role),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        'You do not have the required role to access this resource.',
      );
    }

    return true;
  }
}
