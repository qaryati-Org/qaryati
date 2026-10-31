import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

// Marks which roles may call an endpoint, e.g. @Roles(Role.EDITOR, Role.ADMIN).
// Can be put on a controller class or on a single handler (handler wins).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
