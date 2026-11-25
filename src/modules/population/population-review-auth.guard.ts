import { CanActivate, Injectable, UnauthorizedException } from '@nestjs/common';

export const POPULATION_REVIEW_AUTH_UNAVAILABLE_MESSAGE =
  'Population review requires configured authentication';

@Injectable()
export class PopulationReviewAuthenticationGuard implements CanActivate {
  canActivate(): never {
    throw new UnauthorizedException(POPULATION_REVIEW_AUTH_UNAVAILABLE_MESSAGE);
  }
}
