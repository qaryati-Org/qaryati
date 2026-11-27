import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { callerWithRole, httpAs, TestCaller } from './utils/auth';
import { createTestApp } from './utils/create-test-app';

// Every row this file creates starts with PREFIX, so cleanup never touches
// anyone else's data. Names are removed with their village (CASCADE).
const PREFIX = 'E2E-VN';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('Village alternative names (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let villageId: string;
  let otherVillageId: string;
  let sourceId: string;

  let admin: TestCaller;

  // Write endpoints need a token; ADMIN is allowed on all of them.
  const http = () => httpAs(app, admin);
  const namesPath = (id = villageId) => `/api/v1/villages/${id}/names`;

  const cleanup = async () => {
    await ds.query(`DELETE FROM villages WHERE name_ar LIKE '${PREFIX}%'`);
    await ds.query(`DELETE FROM sources WHERE title LIKE '${PREFIX}%'`);
  };

  beforeAll(async () => {
    app = await createTestApp();
    admin = await callerWithRole(app, Role.ADMIN);
    ds = app.get(DataSource);
    await cleanup();

    const [{ id: nablusId }] = await ds.query(
      `SELECT id FROM governorates WHERE name_en = 'Nablus'`,
    );
    [{ id: villageId }] = await ds.query(
      `INSERT INTO villages (name_ar, name_en, governorate_id)
       VALUES ('${PREFIX} برقة', 'E2E Burqa', $1) RETURNING id`,
      [nablusId],
    );
    [{ id: otherVillageId }] = await ds.query(
      `INSERT INTO villages (name_ar, governorate_id)
       VALUES ('${PREFIX} أخرى', $1) RETURNING id`,
      [nablusId],
    );
    [{ id: sourceId }] = await ds.query(
      `INSERT INTO sources (title, type)
       VALUES ('${PREFIX} gazetteer', 'BOOK') RETURNING id`,
    );
  });

  afterEach(async () => {
    await ds.query(
      'DELETE FROM village_names WHERE village_id = ANY($1::uuid[])',
      [[villageId, otherVillageId]],
    );
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('POST /api/v1/villages/:villageId/names', () => {
    it('adds a historical name with period, note and source', async () => {
      const res = await http()
        .post(namesPath())
        .send({
          name: ' برقة الحجر ',
          type: 'HISTORICAL',
          language: 'AR',
          period: 'Ottoman period',
          note: 'Found in tax registers',
          sourceId,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        villageId,
        name: 'برقة الحجر',
        type: 'HISTORICAL',
        language: 'ar',
        period: 'Ottoman period',
        note: 'Found in tax registers',
        sourceId,
      });
    });

    it('adds a name with only the required fields', async () => {
      const res = await http()
        .post(namesPath())
        .send({ name: 'Burka', type: 'ALTERNATIVE_SPELLING', language: 'en' })
        .expect(201);

      expect(res.body).toMatchObject({
        period: null,
        note: null,
        sourceId: null,
      });
    });

    it.each([
      ['name', { type: 'HISTORICAL', language: 'ar' }],
      ['name', { name: '  ', type: 'HISTORICAL', language: 'ar' }],
      ['type', { name: 'x', type: 'NICKNAME', language: 'ar' }],
      ['language', { name: 'x', type: 'HISTORICAL', language: 'arabic' }],
      [
        'sourceId',
        { name: 'x', type: 'HISTORICAL', language: 'ar', sourceId: 'abc' },
      ],
    ])('returns 400 for an invalid %s', async (field, body) => {
      const res = await http().post(namesPath()).send(body).expect(400);

      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    });

    it('returns 404 for an unknown village', async () => {
      await http()
        .post(namesPath(UNKNOWN_ID))
        .send({ name: 'x', type: 'HISTORICAL', language: 'ar' })
        .expect(404);
    });

    it('returns 422 for an unknown source', async () => {
      await http()
        .post(namesPath())
        .send({
          name: 'x',
          type: 'HISTORICAL',
          language: 'ar',
          sourceId: UNKNOWN_ID,
        })
        .expect(422);
    });

    it('returns 409 for a name the village already has', async () => {
      const body = {
        name: 'Burka',
        type: 'ALTERNATIVE_SPELLING',
        language: 'en',
      };
      await http().post(namesPath()).send(body).expect(201);

      await http()
        .post(namesPath())
        .send({ ...body, type: 'TRANSLITERATION' })
        .expect(409);
    });

    it("returns 409 for the village's current name", async () => {
      await http()
        .post(namesPath())
        .send({ name: 'E2E Burqa', type: 'TRANSLITERATION', language: 'en' })
        .expect(409);
    });

    it('allows the same name on two different villages', async () => {
      const body = { name: 'Khirbet', type: 'HISTORICAL', language: 'ar' };
      await http().post(namesPath()).send(body).expect(201);
      await http().post(namesPath(otherVillageId)).send(body).expect(201);
    });
  });

  describe('GET /api/v1/villages/:villageId/names', () => {
    beforeEach(async () => {
      for (const body of [
        { name: 'Burka', type: 'ALTERNATIVE_SPELLING', language: 'en' },
        { name: 'Burqah', type: 'TRANSLITERATION', language: 'en' },
        { name: 'برقة القديمة', type: 'HISTORICAL', language: 'ar' },
      ]) {
        await http().post(namesPath()).send(body).expect(201);
      }
      await http()
        .post(namesPath(otherVillageId))
        .send({ name: 'Other', type: 'HISTORICAL', language: 'en' })
        .expect(201);
    });

    it("lists only this village's names, ordered by type then name", async () => {
      const res = await http().get(namesPath()).expect(200);

      expect(res.body.data.map((n: { type: string }) => n.type)).toEqual([
        'ALTERNATIVE_SPELLING',
        'TRANSLITERATION',
        'HISTORICAL',
      ]);
    });

    it('filters by type', async () => {
      const res = await http()
        .get(namesPath())
        .query({ type: 'HISTORICAL' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('برقة القديمة');
    });

    it('returns 404 for an unknown village and 400 for a bad type', async () => {
      await http().get(namesPath(UNKNOWN_ID)).expect(404);
      await http().get(namesPath()).query({ type: 'NICKNAME' }).expect(400);
    });
  });

  describe('DELETE /api/v1/villages/:villageId/names/:nameId', () => {
    let nameId: string;

    beforeEach(async () => {
      const res = await http()
        .post(namesPath())
        .send({ name: 'Burka', type: 'ALTERNATIVE_SPELLING', language: 'en' })
        .expect(201);
      nameId = (res.body as { id: string }).id;
    });

    it('removes the name', async () => {
      await http().delete(`${namesPath()}/${nameId}`).expect(204);

      const res = await http().get(namesPath()).expect(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('returns 404 when the name belongs to another village', async () => {
      await http()
        .delete(`${namesPath(otherVillageId)}/${nameId}`)
        .expect(404);
      await http().delete(`${namesPath()}/${UNKNOWN_ID}`).expect(404);
    });
  });

  describe('relations', () => {
    it('removes the names when the village is deleted', async () => {
      const [{ id: nablusId }] = await ds.query(
        `SELECT id FROM governorates WHERE name_en = 'Nablus'`,
      );
      const [{ id: tempVillageId }]: { id: string }[] = await ds.query(
        `INSERT INTO villages (name_ar, governorate_id)
         VALUES ('${PREFIX} مؤقتة', $1) RETURNING id`,
        [nablusId],
      );
      await http()
        .post(namesPath(tempVillageId))
        .send({ name: 'Temp', type: 'HISTORICAL', language: 'en' })
        .expect(201);

      await http().delete(`/api/v1/villages/${tempVillageId}`).expect(204);

      const rows = await ds.query(
        'SELECT 1 FROM village_names WHERE village_id = $1',
        [tempVillageId],
      );
      expect(rows).toHaveLength(0);
    });

    it('returns 409 when deleting a source that a name cites', async () => {
      await http()
        .post(namesPath())
        .send({ name: 'Cited', type: 'HISTORICAL', language: 'en', sourceId })
        .expect(201);

      await http().delete(`/api/v1/sources/${sourceId}`).expect(409);
    });
  });
});
