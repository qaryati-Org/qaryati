import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AccessTokenPayload } from '../../src/modules/auth/authenticated-user';
import { Role } from '../../src/modules/auth/enums/role.enum';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/modules/auth/guards/roles.guard';

// For controller unit tests that build a small Nest app without AuthModule:
// adds the same global guards the real app uses, with a test-only secret.
//   Test.createTestingModule({
//     imports: [...AUTH_TESTING_IMPORTS],
//     providers: [...AUTH_TESTING_PROVIDERS, ...],
//   })
const TEST_JWT_SECRET = 'unit-test-only-jwt-secret-0123456789';

export const AUTH_TESTING_IMPORTS = [
  JwtModule.register({ secret: TEST_JWT_SECRET }),
];

export const AUTH_TESTING_PROVIDERS = [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
];

export const TEST_CALLER_ID = '00000000-0000-4000-8000-0000000000ca';

// Value for the Authorization header of a caller with the given role.
export function bearerFor(role: Role, userId = TEST_CALLER_ID): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    email: `${role.toLowerCase()}@example.com`,
    role,
  };
  return `Bearer ${new JwtService({ secret: TEST_JWT_SECRET }).sign(payload)}`;
}
