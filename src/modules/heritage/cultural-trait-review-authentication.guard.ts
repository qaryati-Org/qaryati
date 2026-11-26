import { CanActivate, Injectable, UnauthorizedException } from '@nestjs/common';

export const CULTURAL_TRAIT_REVIEW_AUTH_UNAVAILABLE_MESSAGE =
  'Cultural trait review requires configured authentication';

@Injectable()
export class CulturalTraitReviewAuthenticationGuard implements CanActivate {
  canActivate(): never {
    throw new UnauthorizedException(
      CULTURAL_TRAIT_REVIEW_AUTH_UNAVAILABLE_MESSAGE,
    );
  }
}
