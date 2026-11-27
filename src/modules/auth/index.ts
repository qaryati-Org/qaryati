// Public API of the auth module for other modules:
// import { Role, Roles, CurrentUser, AuthenticatedUser } from '../auth';
export type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-user';
export { CurrentUser } from './decorators/current-user.decorator';
export { Roles, ROLES_KEY } from './decorators/roles.decorator';
export { Role } from './enums/role.enum';
