import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../authenticated-user';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

export const AUTHENTICATION_REQUIRED_MESSAGE = 'Authentication required';
export const ROLE_NOT_ALLOWED_MESSAGE =
  'Your role is not allowed to perform this action';

// Registered globally by AuthModule after JwtAuthGuard, so request.user is
// already set when a valid token was sent. Endpoints without @Roles() stay
// public; with @Roles() the caller needs a token (401) and one of the listed
// roles (403). Roles are not hierarchical: list every allowed role,
// e.g. @Roles(Role.EDITOR, Role.ADMIN).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.getRequiredRoles(context);
    if (requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new UnauthorizedException(AUTHENTICATION_REQUIRED_MESSAGE);
    }
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(ROLE_NOT_ALLOWED_MESSAGE);
    }
    return true;
  }

  getRequiredRoles(context: ExecutionContext): Role[] {
    return (
      this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []
    );
  }
}
