import { ConflictException, INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { UsersService } from '../src/modules/users/users.service';
import { createTestApp } from './utils/create-test-app';

// No endpoints yet: these check the users table, its constraints and the
// service against a real Postgres.
describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersService;
  let ds: DataSource;

  const cleanup = () =>
    ds.query(`DELETE FROM users WHERE email LIKE 'e2e-%@example.com'`);

  beforeAll(async () => {
    app = await createTestApp();
    users = app.get(UsersService);
    ds = app.get(DataSource);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('creates a VIEWER and never loads the password hash by default', async () => {
    const created = await users.create({
      email: 'E2E-Viewer@Example.com',
      passwordHash: 'hash-value',
      displayName: 'Viewer',
    });
    expect(created).toMatchObject({
      email: 'e2e-viewer@example.com',
      role: Role.VIEWER,
      isActive: true,
    });

    const byId = await users.findById(created.id);
    expect(byId?.passwordHash).toBeUndefined();

    const forLogin = await users.findByEmail('E2E-VIEWER@example.com', true);
    expect(forLogin?.passwordHash).toBe('hash-value');
  });

  it('rejects a second user with the same email in any letter case', async () => {
    await expect(
      users.create({
        email: 'e2e-viewer@EXAMPLE.com',
        passwordHash: 'other',
        displayName: 'Copy',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks non-lowercase emails at the database level', async () => {
    await expect(
      ds.query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ('e2e-UPPER@example.com', 'h', 'Upper')`,
      ),
    ).rejects.toThrow(/chk_users_email_lowercase/);
  });
});
