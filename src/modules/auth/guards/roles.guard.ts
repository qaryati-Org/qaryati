import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

// Registered globally by AuthModule, so every endpoint goes through it.
// For now it allows every request: login/JWT does not exist yet, so there is
// no user to check. It already reads @Roles() so the real check can be added
// here later without anyone changing their controllers.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.getRequiredRoles(context);
    if (requiredRoles.length === 0) {
      return true;
    }
    // TODO(auth): compare requiredRoles with the authenticated user's role
    // once JWT login exists, and throw ForbiddenException on a mismatch.
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
