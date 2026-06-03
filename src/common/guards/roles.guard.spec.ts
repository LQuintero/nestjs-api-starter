import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesService } from '../../roles/roles.service';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let rolesService: { findUserRoleNames: jest.Mock };

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
    rolesService = { findUserRoleNames: jest.fn() };
    guard = new RolesGuard(
      reflector as unknown as Reflector,
      rolesService as unknown as RolesService,
    );
  });

  it('allows the request when no roles are required', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(
      guard.canActivate(createContext({ id: 'user_1' })),
    ).resolves.toBe(true);
    expect(rolesService.findUserRoleNames).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when there is no authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);

    await expect(guard.canActivate(createContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(rolesService.findUserRoleNames).not.toHaveBeenCalled();
  });

  it('allows when the user has an active required role', async () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    rolesService.findUserRoleNames.mockResolvedValue(['admin', 'user']);

    await expect(
      guard.canActivate(createContext({ id: 'user_1' })),
    ).resolves.toBe(true);
    expect(rolesService.findUserRoleNames).toHaveBeenCalledWith('user_1');
  });

  it('denies when the matching role is inactive / missing from active roles', async () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    // The service only ever returns active role names, so an inactive "admin"
    // role is simply absent from the returned list.
    rolesService.findUserRoleNames.mockResolvedValue(['user']);

    await expect(
      guard.canActivate(createContext({ id: 'user_1' })),
    ).rejects.toThrow(ForbiddenException);
  });
});
