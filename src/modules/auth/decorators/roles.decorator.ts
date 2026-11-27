import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

// Marks which roles may call an endpoint, e.g. @Roles(Role.EDITOR, Role.ADMIN).
// Can be put on a controller class or on a single handler (handler wins).
// It also marks the endpoint as needing a bearer token in Swagger, so
// Swagger UI and API-Dog send the token there and only there.
export const Roles = (...roles: Role[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), ApiBearerAuth());
