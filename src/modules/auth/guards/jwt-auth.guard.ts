import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AccessTokenPayload,
  AuthenticatedRequest,
} from '../authenticated-user';

export const INVALID_ACCESS_TOKEN_MESSAGE = 'Invalid or expired access token';

// Registered globally before RolesGuard. A request without a token goes on
// as anonymous (public reads keep working); a request with a bad token is
// rejected with 401 instead of silently treated as anonymous.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header) return true;

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException(INVALID_ACCESS_TOKEN_MESSAGE);
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException(INVALID_ACCESS_TOKEN_MESSAGE);
    }
    return true;
  }
}
