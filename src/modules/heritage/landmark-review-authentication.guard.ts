import { CanActivate, Injectable, UnauthorizedException } from '@nestjs/common';

export const LANDMARK_REVIEW_AUTH_UNAVAILABLE_MESSAGE =
  'Landmark review requires configured authentication';

@Injectable()
export class LandmarkReviewAuthenticationGuard implements CanActivate {
  canActivate(): never {
    throw new UnauthorizedException(LANDMARK_REVIEW_AUTH_UNAVAILABLE_MESSAGE);
  }
}
