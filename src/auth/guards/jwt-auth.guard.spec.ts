import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('allows routes marked public without requiring an authorization header', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ headers: {} }),
      }),
    } as unknown as ExecutionContext;
    const guard = new JwtAuthGuard(
      { verifyAsync: jest.fn() } as never,
      { getOrThrow: jest.fn() } as never,
      { findById: jest.fn() } as never,
      reflector as unknown as Reflector,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
