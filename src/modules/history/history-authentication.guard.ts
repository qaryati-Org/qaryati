import { CanActivate, Injectable, UnauthorizedException } from '@nestjs/common';

export const HISTORY_AUTH_UNAVAILABLE_MESSAGE =
  'History writes require configured authentication';

@Injectable()
export class HistoryAuthenticationGuard implements CanActivate {
  canActivate(): never {
    throw new UnauthorizedException(HISTORY_AUTH_UNAVAILABLE_MESSAGE);
  }
}
