import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesService } from '../../roles/roles.service';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let rolesService: { findUserPermissionNames: jest.Mock };

  const createContext = (user?: unknown): ExecutionContext => {
    const request = user === undefined ? {} : { user };

    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    rolesService = { findUserPermissionNames: jest.fn() };
    guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      rolesService as unknown as RolesService,
    );
  });

  it('allows the request when no permissions are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(createContext({ id: 'user_1' })),
    ).resolves.toBe(true);
    expect(rolesService.findUserPermissionNames).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when there is no authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users:read']);

    await expect(guard.canActivate(createContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(rolesService.findUserPermissionNames).not.toHaveBeenCalled();
  });

  it('allows when the user has all required active permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:write']);
    rolesService.findUserPermissionNames.mockResolvedValue([
      'users:read',
      'users:write',
      'roles:read',
    ]);

    await expect(
      guard.canActivate(createContext({ id: 'user_1' })),
    ).resolves.toBe(true);
    expect(rolesService.findUserPermissionNames).toHaveBeenCalledWith('user_1');
  });

  it('denies when one required permission is inactive / missing from active permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:write']);
    // The service only ever returns active permission names, so an inactive
    // "users:write" permission is simply absent from the returned list.
    rolesService.findUserPermissionNames.mockResolvedValue(['users:read']);

    await expect(
      guard.canActivate(createContext({ id: 'user_1' })),
    ).rejects.toThrow(ForbiddenException);
  });
});
