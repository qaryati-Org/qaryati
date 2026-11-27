import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';

// Separate app with a low limit, so the other e2e files are not throttled.
describe('Auth rate limiting (e2e)', () => {
  const LIMIT = 3;
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ authRateLimit: LIMIT });
  });

  afterAll(async () => {
    await app.close();
  });

  const login = () =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong password' });

  it('returns 429 after too many login attempts from one IP', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await login().expect(401);
    }
    const res = await login().expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('does not rate limit other endpoints', async () => {
    for (let i = 0; i < LIMIT + 2; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/villages?limit=1')
        .expect(200);
    }
  });
});
