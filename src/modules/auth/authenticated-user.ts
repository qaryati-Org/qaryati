import { Request } from 'express';
import { Role } from './enums/role.enum';

// What a valid access token proves about the caller. Taken from the token
// claims, so a role change applies from the user's next login or refresh.
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
