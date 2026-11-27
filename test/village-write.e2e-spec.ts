import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { callerWithRole, httpAs, TestCaller } from './utils/auth';
import { createTestApp } from './utils/create-test-app';

// Every row this file creates has a name starting with PREFIX, so cleanup
// never touches anyone else's data.
const PREFIX = 'E2E-VW';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

interface VillageBody {
  id: string;
  nameAr: string;
  nameEn: string | null;
  nameOrigin: string | null;
  governorate: { id: string };
  municipality: { id: string } | null;
}

describe('Village write endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let nablusId: string;
  let jeninId: string;
  let nablusCouncilId: string;
  let jeninCouncilId: string;

  let admin: TestCaller;

  // Write endpoints need a token; ADMIN is allowed on all of them.
  const http = () => httpAs(app, admin);

  const cleanup = async () => {
    await ds.query(
      `DELETE FROM population_records WHERE source_id IN
         (SELECT id FROM sources WHERE title LIKE '${PREFIX}%')`,
    );
    await ds.query(`DELETE FROM sources WHERE title LIKE '${PREFIX}%'`);
    await ds.query(`DELETE FROM villages WHERE name_ar LIKE '${PREFIX}%'`);
    await ds.query(
      `DELETE FROM municipalities WHERE name_ar LIKE '${PREFIX}%'`,
    );
  };

  const createVillage = async (body: object): Promise<VillageBody> => {
    const res = await http().post('/api/v1/villages').send(body).expect(201);
    return res.body as VillageBody;
  };

  beforeAll(async () => {
    app = await createTestApp();
    admin = await callerWithRole(app, Role.ADMIN);
    ds = app.get(DataSource);
    await cleanup();

    [{ id: nablusId }] = await ds.query(
      `SELECT id FROM governorates WHERE name_en = 'Nablus'`,
    );
    [{ id: jeninId }] = await ds.query(
      `SELECT id FROM governorates WHERE name_en = 'Jenin'`,
    );
    [{ id: nablusCouncilId }] = await ds.query(
      `INSERT INTO municipalities (name_ar, type, governorate_id)
       VALUES ('${PREFIX} مجلس نابلس', 'VILLAGE_COUNCIL', $1) RETURNING id`,
      [nablusId],
    );
    [{ id: jeninCouncilId }] = await ds.query(
      `INSERT INTO municipalities (name_ar, type, governorate_id)
       VALUES ('${PREFIX} مجلس جنين', 'VILLAGE_COUNCIL', $1) RETURNING id`,
      [jeninId],
    );
  });

  afterEach(async () => {
    await ds.query(
      `DELETE FROM population_records WHERE source_id IN
         (SELECT id FROM sources WHERE title LIKE '${PREFIX}%')`,
    );
    await ds.query(`DELETE FROM villages WHERE name_ar LIKE '${PREFIX}%'`);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('POST /api/v1/villages', () => {
    it('creates a village with only the required fields', async () => {
      const body = await createVillage({
        nameAr: `${PREFIX} برقة`,
        governorateId: nablusId,
      });

      expect(body).toMatchObject({
        nameAr: `${PREFIX} برقة`,
        nameEn: null,
        nameOrigin: null,
        governorate: { id: nablusId, nameEn: 'Nablus' },
        municipality: null,
      });
      await http().get(`/api/v1/villages/${body.id}`).expect(200);
    });

    it('creates a village with all fields and trims the names', async () => {
      const body = await createVillage({
        nameAr: `  ${PREFIX} سبسطية  `,
        nameEn: ' Sebastia ',
        nameOrigin: 'From the Greek "Sebastos"',
        governorateId: nablusId,
        municipalityId: nablusCouncilId,
      });

      expect(body).toMatchObject({
        nameAr: `${PREFIX} سبسطية`,
        nameEn: 'Sebastia',
        nameOrigin: 'From the Greek "Sebastos"',
        municipality: { id: nablusCouncilId },
      });
    });

    // The governorate id is only known after beforeAll, so each case
    // builds its body from it.
    it.each([
      ['nameAr', 'missing nameAr', (g: string) => ({ governorateId: g })],
      [
        'nameAr',
        'blank nameAr',
        (g: string) => ({ nameAr: '   ', governorateId: g }),
      ],
      [
        'nameAr',
        'too long nameAr',
        (g: string) => ({ nameAr: 'x'.repeat(151), governorateId: g }),
      ],
      [
        'governorateId',
        'invalid governorateId',
        () => ({ nameAr: `${PREFIX} x`, governorateId: 'abc' }),
      ],
      [
        'foo',
        'unknown field',
        (g: string) => ({ nameAr: `${PREFIX} x`, governorateId: g, foo: 1 }),
      ],
    ])('returns 400 on %s for %s', async (field, _case, body) => {
      const res = await http().post('/api/v1/villages').send(body(nablusId));

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    });

    it('returns 422 for an unknown governorate', async () => {
      const res = await http()
        .post('/api/v1/villages')
        .send({ nameAr: `${PREFIX} x`, governorateId: UNKNOWN_ID });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('returns 422 for an unknown municipality', async () => {
      const res = await http()
        .post('/api/v1/villages')
        .send({
          nameAr: `${PREFIX} x`,
          governorateId: nablusId,
          municipalityId: UNKNOWN_ID,
        });

      expect(res.status).toBe(422);
    });

    it('returns 422 when the municipality is in another governorate', async () => {
      const res = await http()
        .post('/api/v1/villages')
        .send({
          nameAr: `${PREFIX} x`,
          governorateId: nablusId,
          municipalityId: jeninCouncilId,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/is not in governorate/);
    });

    it('returns 409 for the same Arabic name in the same governorate', async () => {
      await createVillage({
        nameAr: `${PREFIX} عصيرة`,
        governorateId: nablusId,
      });

      const res = await http()
        .post('/api/v1/villages')
        .send({ nameAr: ` ${PREFIX} عصيرة `, governorateId: nablusId });

      expect(res.status).toBe(409);
    });

    it('allows the same Arabic name in a different governorate', async () => {
      await createVillage({
        nameAr: `${PREFIX} برقين`,
        governorateId: nablusId,
      });
      await createVillage({
        nameAr: `${PREFIX} برقين`,
        governorateId: jeninId,
      });
    });
  });

  describe('PATCH /api/v1/villages/:id', () => {
    let village: VillageBody;

    beforeEach(async () => {
      village = await createVillage({
        nameAr: `${PREFIX} قرية`,
        nameEn: 'Qarya',
        governorateId: nablusId,
        municipalityId: nablusCouncilId,
      });
    });

    it('updates only the fields that were sent', async () => {
      const res = await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ nameOrigin: 'Means "village"' })
        .expect(200);

      expect(res.body).toMatchObject({
        nameAr: `${PREFIX} قرية`,
        nameEn: 'Qarya',
        nameOrigin: 'Means "village"',
        municipality: { id: nablusCouncilId },
      });
    });

    it('clears nameEn and the municipality with null', async () => {
      const res = await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ nameEn: null, municipalityId: null })
        .expect(200);

      expect(res.body).toMatchObject({ nameEn: null, municipality: null });
      expect(res.body.governorate.id).toBe(nablusId);
    });

    it('returns 400 when a required field is set to null', async () => {
      await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ nameAr: null })
        .expect(400);
      await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ governorateId: null })
        .expect(400);
    });

    it('returns 404 for an unknown village', async () => {
      await http()
        .patch(`/api/v1/villages/${UNKNOWN_ID}`)
        .send({ nameEn: 'x' })
        .expect(404);
    });

    it('returns 409 when renamed to an existing name in the governorate', async () => {
      await createVillage({
        nameAr: `${PREFIX} أخرى`,
        governorateId: nablusId,
      });

      await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ nameAr: `${PREFIX} أخرى` })
        .expect(409);
    });

    it('returns 422 when moved to another governorate with its old municipality', async () => {
      const res = await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ governorateId: jeninId })
        .expect(422);

      expect(res.body.error.message).toMatch(/send municipalityId/);
    });

    it('moves a village with a municipality of the new governorate', async () => {
      const res = await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ governorateId: jeninId, municipalityId: jeninCouncilId })
        .expect(200);

      expect(res.body).toMatchObject({
        governorate: { id: jeninId },
        municipality: { id: jeninCouncilId },
      });
    });

    it('moves a village and detaches it from its municipality', async () => {
      const res = await http()
        .patch(`/api/v1/villages/${village.id}`)
        .send({ governorateId: jeninId, municipalityId: null })
        .expect(200);

      expect(res.body).toMatchObject({
        governorate: { id: jeninId },
        municipality: null,
      });
    });
  });

  describe('DELETE /api/v1/villages/:id', () => {
    it('deletes a village without related records', async () => {
      const village = await createVillage({
        nameAr: `${PREFIX} للحذف`,
        governorateId: nablusId,
      });

      await http().delete(`/api/v1/villages/${village.id}`).expect(204);
      await http().get(`/api/v1/villages/${village.id}`).expect(404);
    });

    it('returns 404 for an unknown village', async () => {
      await http().delete(`/api/v1/villages/${UNKNOWN_ID}`).expect(404);
    });

    it('returns 409 while population records still reference the village', async () => {
      const village = await createVillage({
        nameAr: `${PREFIX} لها سجلات`,
        governorateId: nablusId,
      });
      const [{ id: sourceId }] = await ds.query(
        `INSERT INTO sources (title, type) VALUES ('${PREFIX} census', 'SURVEY')
         RETURNING id`,
      );
      await ds.query(
        `INSERT INTO population_records
           (village_id, source_id, value, reference_year, status)
         VALUES ($1, $2, 1200, 1997, 'PENDING')`,
        [village.id, sourceId],
      );

      await http().delete(`/api/v1/villages/${village.id}`).expect(409);
      await http().get(`/api/v1/villages/${village.id}`).expect(200);
    });
  });
});
