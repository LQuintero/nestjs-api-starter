import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Shape of the authenticated principal attached to the request by the auth
 * layer. Until JwtAuthGuard is wired in Task 7, `request.user` may be absent,
 * so consumers should treat the result as possibly undefined and fail closed.
 */
export interface AuthenticatedRequestUser {
  id: string;
  email: string;
}

interface RequestWithUser {
  user?: AuthenticatedRequestUser;
}

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedRequestUser | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
