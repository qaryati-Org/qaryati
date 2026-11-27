import { ConflictException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AccessTokenPayload } from '../../src/modules/auth/authenticated-user';
import { Role } from '../../src/modules/auth/enums/role.enum';
import { UsersService } from '../../src/modules/users/users.service';

export interface TestCaller {
  userId: string;
  headers: { Authorization: string };
}

// One fixed user per role, shared by all e2e files (found or created), so
// repeated runs do not pile up users. Never deleted: verified records point
// at them through reviewed_by_id.
export async function callerWithRole(
  app: INestApplication<App>,
  role: Role,
): Promise<TestCaller> {
  const users = app.get(UsersService);
  const email = `test-caller-${role.toLowerCase()}@example.com`;
  let user = await users.findByEmail(email);
  if (!user) {
    try {
      user = await users.create({
        email,
        // Not a valid argon2 hash: these users can never log in by password.
        passwordHash: 'test-caller-without-password',
        displayName: `Test ${role}`,
        role,
      });
    } catch (err) {
      // Another test file created it at the same moment.
      if (!(err instanceof ConflictException)) throw err;
      user = await users.findByEmail(email);
    }
  }
  if (!user) throw new Error(`Could not create test caller ${email}`);

  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  const token = await app.get(JwtService).signAsync(payload);
  return { userId: user.id, headers: { Authorization: `Bearer ${token}` } };
}

// A supertest client that sends the caller's access token on every request,
// e.g. `const http = () => httpAs(app, admin);`
export function httpAs(app: INestApplication<App>, caller: TestCaller) {
  return request.agent(app.getHttpServer()).set(caller.headers);
}
