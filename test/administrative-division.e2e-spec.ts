import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

const PREFIX = 'E2E-ADM';

describe('Governorates, municipalities and village administration (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let nablusId: string;
  let jeninId: string;
  let councilId: string;
  let villageInCouncilId: string;

  const cleanup = async () => {
    await ds.query(`DELETE FROM villages WHERE name_en LIKE '${PREFIX}%'`);
    await ds.query(
      `DELETE FROM municipalities WHERE name_en LIKE '${PREFIX}%'`,
    );
  };

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await cleanup();

    [{ id: nablusId }] = await ds.query(
      `SELECT id FROM governorates WHERE name_en = 'Nablus'`,
    );
    [{ id: jeninId }] = await ds.query(
      `SELECT id FROM governorates WHERE name_en = 'Jenin'`,
    );
    [{ id: councilId }] = await ds.query(
      `INSERT INTO municipalities (name_ar, name_en, type, governorate_id)
       VALUES ('مجلس اختبار', '${PREFIX} Council', 'VILLAGE_COUNCIL', $1)
       RETURNING id`,
      [nablusId],
    );
    await ds.query(
      `INSERT INTO municipalities (name_ar, name_en, type, governorate_id)
       VALUES ('بلدية اختبار', '${PREFIX} Municipality', 'MUNICIPALITY', $1)`,
      [jeninId],
    );
    [{ id: villageInCouncilId }] = await ds.query(
      `INSERT INTO villages (name_ar, name_en, name_origin, governorate_id, municipality_id)
       VALUES ('قرية اختبار ١', '${PREFIX} Village 1', 'From the Aramaic for "spring"', $1, $2)
       RETURNING id`,
      [nablusId, councilId],
    );
    await ds.query(
      `INSERT INTO villages (name_ar, name_en, governorate_id)
       VALUES ('قرية اختبار ٢', '${PREFIX} Village 2', $1)`,
      [nablusId],
    );
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('GET /api/v1/governorates', () => {
    it('returns all 16 governorates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/governorates')
        .expect(200);
      expect(res.body.data).toHaveLength(16);
      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nameEn: 'Nablus', nameAr: 'نابلس' }),
        ]),
      );
    });
  });

  describe('GET /api/v1/municipalities', () => {
    it('filters by governorate and type', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/municipalities?q=${PREFIX}&governorateId=${nablusId}&type=VILLAGE_COUNCIL`,
        )
        .expect(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0]).toMatchObject({
        id: councilId,
        type: 'VILLAGE_COUNCIL',
        governorate: { id: nablusId },
      });
    });

    it('rejects an unknown type', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/municipalities?type=CITY')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('gets one municipality and 404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/municipalities/${councilId}`)
        .expect(200);
      const res = await request(app.getHttpServer())
        .get('/api/v1/municipalities/00000000-0000-4000-8000-000000000000')
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('villages with municipality and name origin', () => {
    it('filters villages by municipality', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/villages?municipalityId=${councilId}`)
        .expect(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0]).toMatchObject({
        id: villageInCouncilId,
        nameOrigin: 'From the Aramaic for "spring"',
        municipality: { id: councilId, type: 'VILLAGE_COUNCIL' },
      });
    });

    it('returns municipality null for a village without one', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/villages?q=${PREFIX} Village 2`)
        .expect(200);
      expect(res.body.data[0]).toMatchObject({
        municipality: null,
        nameOrigin: null,
      });
    });

    it('includes municipality in the village details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/villages/${villageInCouncilId}`)
        .expect(200);
      expect(res.body.municipality).toMatchObject({ id: councilId });
    });
  });

  describe('database consistency rule', () => {
    it('rejects a village whose municipality is in another governorate', async () => {
      await expect(
        ds.query(
          `INSERT INTO villages (name_ar, name_en, governorate_id, municipality_id)
           VALUES ('قرية خاطئة', '${PREFIX} Wrong', $1, $2)`,
          [jeninId, councilId],
        ),
      ).rejects.toThrow(/villages_municipality_same_governorate_fkey/);
    });
  });
});
