import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const password = 'a long enough password';

  const cleanup = () =>
    ds.query(`DELETE FROM users WHERE email LIKE 'e2e-auth-%@example.com'`);

  const http = () => request(app.getHttpServer());

  async function registerAndLogin(name: string) {
    const email = `e2e-auth-${name}@example.com`;
    await http()
      .post('/api/v1/auth/register')
      .send({ email, password, displayName: name })
      .expect(201);
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body as { accessToken: string; refreshToken: string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('register', () => {
    it('creates a VIEWER and returns tokens without the hash', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          email: 'E2E-Auth-New@Example.com',
          password,
          displayName: 'New',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        user: { email: 'e2e-auth-new@example.com', role: 'VIEWER' },
      });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const [row] = await ds.query(
        `SELECT password_hash FROM users WHERE email = 'e2e-auth-new@example.com'`,
      );
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
    });

    it('rejects a role sent by the client (no self-promotion)', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e-auth-sneaky@example.com',
          password,
          displayName: 'Sneaky',
          role: 'ADMIN',
        })
        .expect(400);
    });

    it('returns 409 for a duplicate email', async () => {
      await http()
        .post('/api/v1/auth/register')
        .send({ email: 'e2e-auth-new@example.com', password, displayName: 'X' })
        .expect(409);
    });

    it('returns 400 for a short password', async () => {
      const res = await http()
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e-auth-short@example.com',
          password: 'short',
          displayName: 'S',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('login and me', () => {
    it('returns the current user for a valid access token', async () => {
      const { accessToken } = await registerAndLogin('me');
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        email: 'e2e-auth-me@example.com',
        role: 'VIEWER',
      });
    });

    it('returns 401 for me without a token or with a bad one', async () => {
      await http().get('/api/v1/auth/me').expect(401);
      await http()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-token')
        .expect(401);
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const wrong = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth-me@example.com', password: 'wrong password' })
        .expect(401);
      const unknown = await http()
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth-nobody@example.com', password })
        .expect(401);
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });

    it('keeps public reads working without a token', async () => {
      await http().get('/api/v1/villages?limit=1').expect(200);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the refresh token and rejects the old one', async () => {
      const { refreshToken } = await registerAndLogin('rotate');

      const first = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(first.body.refreshToken).not.toBe(refreshToken);

      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('revokes the whole login when an old token is reused', async () => {
      const { refreshToken: stolen } = await registerAndLogin('reuse');
      const legit = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: stolen })
        .expect(200);

      // The attacker replays the old token...
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: stolen })
        .expect(401);
      // ...so the legitimate newer token stops working too.
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: legit.body.refreshToken })
        .expect(401);
    });

    it('lets only one of two concurrent refreshes succeed', async () => {
      const { refreshToken } = await registerAndLogin('race');
      const results = await Promise.all([
        http().post('/api/v1/auth/refresh').send({ refreshToken }),
        http().post('/api/v1/auth/refresh').send({ refreshToken }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('logout revokes the refresh token and is idempotent', async () => {
      const { refreshToken } = await registerAndLogin('logout');
      await http()
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);
      await http()
        .post('/api/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });
});
