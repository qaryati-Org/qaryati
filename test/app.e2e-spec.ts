import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

// Needs a running Postgres (docker compose up -d db). Migrations run on boot.
describe('Skeleton (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports the database is up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('echoes a valid incoming correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-correlation-id', 'test-123')
      .expect(200);
    expect(res.headers['x-correlation-id']).toBe('test-123');
  });

  it('returns the standard error format for unknown routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);
    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
      path: '/api/v1/does-not-exist',
    });
    expect(res.body.error.correlationId).toBeDefined();
  });

  it('returns field-level validation errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/villages?limit=1000&sort=password')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map(
      (d: { field: string }) => d.field,
    );
    expect(fields).toEqual(expect.arrayContaining(['limit', 'sort']));
  });

  describe('villages', () => {
    let villageId: string;

    beforeAll(async () => {
      const ds = app.get(DataSource);
      const [gov] = await ds.query(
        `SELECT id FROM governorates WHERE name_en = 'Nablus'`,
      );
      await ds.query(`DELETE FROM villages WHERE name_en LIKE 'E2E %'`);
      const [v] = await ds.query(
        `INSERT INTO villages (name_ar, name_en, governorate_id)
         VALUES ('اختبار', 'E2E Village', $1) RETURNING id`,
        [gov.id],
      );
      villageId = v.id;
    });

    afterAll(async () => {
      await app
        .get(DataSource)
        .query(`DELETE FROM villages WHERE name_en LIKE 'E2E %'`);
    });

    it('lists villages with pagination meta', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/villages?q=e2e&limit=5')
        .expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 5, total: 1 });
      expect(res.body.data[0]).toMatchObject({
        id: villageId,
        nameEn: 'E2E Village',
        governorate: { nameEn: 'Nablus' },
      });
    });

    it('gets one village and 404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/villages/${villageId}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/villages/00000000-0000-4000-8000-000000000000')
        .expect(404);
    });
  });
});
