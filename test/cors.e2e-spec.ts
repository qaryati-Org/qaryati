import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';

const ALLOWED = 'http://localhost:5173';
const OTHER = 'https://evil.example';

const preflight = (app: INestApplication<App>, origin: string) =>
  request(app.getHttpServer())
    .options('/api/v1/sources')
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'authorization,content-type');

describe('CORS (e2e)', () => {
  describe('with CORS_ORIGINS set', () => {
    let app: INestApplication<App>;
    const previous = process.env.CORS_ORIGINS;

    beforeAll(async () => {
      process.env.CORS_ORIGINS = `${ALLOWED},https://qaryati.example`;
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
      if (previous === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = previous;
    });

    it('answers the preflight of an allowed origin', async () => {
      const res = await preflight(app, ALLOWED).expect(204);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-allow-headers']).toMatch(
        /Authorization/,
      );
      expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('lets the browser read the correlation id on a normal request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', ALLOWED)
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-expose-headers']).toMatch(
        /x-correlation-id/,
      );
    });

    it('does not allow an origin that is not listed', async () => {
      const res = await preflight(app, OTHER);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('without CORS_ORIGINS (default)', () => {
    let app: INestApplication<App>;
    const previous = process.env.CORS_ORIGINS;

    beforeAll(async () => {
      delete process.env.CORS_ORIGINS;
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
      if (previous !== undefined) process.env.CORS_ORIGINS = previous;
    });

    it('sends no CORS headers, so browsers on other origins are blocked', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', ALLOWED)
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
