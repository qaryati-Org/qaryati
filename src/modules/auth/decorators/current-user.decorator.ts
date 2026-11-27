import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, AuthenticatedUser } from '../authenticated-user';

// The caller proven by the access token, or undefined for anonymous
// requests, e.g. `verify(@CurrentUser() user: AuthenticatedUser)`.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
