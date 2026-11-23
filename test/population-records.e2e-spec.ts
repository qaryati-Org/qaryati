import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

type PopulationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface PopulationRow {
  id: string;
  village_id: string;
  source_id: string;
  value: number;
  reference_year: number;
  status: PopulationStatus;
  reviewed_at: Date | null;
  reviewed_by_id: string | null;
  review_note: string | null;
}

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  village: randomUUID(),
  otherVillage: randomUUID(),
  sources: [randomUUID(), randomUUID()] as const,
};

describe('Population records (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  const populationRecordIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The test database is not initialized');
    }
    return dataSource;
  };

  const http = () => {
    if (!app) {
      throw new Error('The test application is not initialized');
    }
    return request(app.getHttpServer());
  };

  const recordsPath = (villageId: string = fixtureIds.village) =>
    `/api/v1/villages/${villageId}/population-records`;

  const trackRecordId = (body: unknown): string => {
    if (
      typeof body === 'object' &&
      body !== null &&
      'id' in body &&
      typeof body.id === 'string'
    ) {
      populationRecordIds.add(body.id);
      return body.id;
    }
    throw new Error('Expected the response to contain a record ID');
  };

  const postRecord = async (
    body: object,
    villageId: string = fixtureIds.village,
  ) => {
    const response = await http().post(recordsPath(villageId)).send(body);
    if (response.status === 201) {
      trackRecordId(response.body);
    }
    return response;
  };

  const insertRecord = async (
    value: number,
    referenceYear: number,
    status: PopulationStatus = 'PENDING',
    sourceId: string = fixtureIds.sources[0],
    villageId: string = fixtureIds.village,
  ): Promise<string> => {
    const id = randomUUID();
    await db().query(
      `INSERT INTO population_records
         (id, village_id, source_id, value, reference_year, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, villageId, sourceId, value, referenceYear, status],
    );
    populationRecordIds.add(id);
    return id;
  };

  const readRecord = async (id: string): Promise<PopulationRow | undefined> => {
    const rows = await db().query<PopulationRow[]>(
      `SELECT id, village_id, source_id, value, reference_year, status,
              reviewed_at, reviewed_by_id, review_note
       FROM population_records WHERE id = $1`,
      [id],
    );
    return rows[0];
  };

  const resetPopulationRecords = async (): Promise<void> => {
    const knownIds = [...populationRecordIds];
    if (knownIds.length > 0) {
      await db().query(
        'DELETE FROM population_records WHERE id = ANY($1::uuid[])',
        [knownIds],
      );
    }
    await db().query(
      'DELETE FROM population_records WHERE village_id = ANY($1::uuid[])',
      [[fixtureIds.village, fixtureIds.otherVillage]],
    );
    populationRecordIds.clear();
  };

  const cleanupFixtures = async (): Promise<void> => {
    if (!dataSource) {
      return;
    }
    await resetPopulationRecords();
    await db().query('DELETE FROM villages WHERE id = ANY($1::uuid[])', [
      [fixtureIds.village, fixtureIds.otherVillage],
    ]);
    await db().query('DELETE FROM sources WHERE id = ANY($1::uuid[])', [
      [...fixtureIds.sources],
    ]);
    await db().query('DELETE FROM governorates WHERE id = $1', [
      fixtureIds.governorate,
    ]);
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await cleanupFixtures();

    await db().query(
      `INSERT INTO governorates (id, name_ar, name_en)
       VALUES ($1, $2, $3)`,
      [
        fixtureIds.governorate,
        `E2E-POP-${fixtureToken}`,
        `E2E Population ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4)`,
      [
        fixtureIds.village,
        `E2E-POP-${fixtureToken}-village`,
        `E2E Population ${fixtureToken} Village`,
        fixtureIds.governorate,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4)`,
      [
        fixtureIds.otherVillage,
        `E2E-POP-${fixtureToken}-other`,
        `E2E Population ${fixtureToken} Other Village`,
        fixtureIds.governorate,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'SURVEY'), ($3, $4, 'SURVEY')`,
      [
        fixtureIds.sources[0],
        `E2E-POP-${fixtureToken} census`,
        fixtureIds.sources[1],
        `E2E-POP-${fixtureToken} survey`,
      ],
    );
  }, 30000);

  afterEach(async () => {
    if (dataSource) {
      await resetPopulationRecords();
    }
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  describe('POST /api/v1/villages/:villageId/population-records', () => {
    it('creates a PENDING record with zero population and null review metadata', async () => {
      const response = await postRecord({
        value: 0,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        value: 0,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
        villageId: fixtureIds.village,
        status: 'PENDING',
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
      });

      const row = await readRecord(trackRecordId(response.body));
      expect(row).toMatchObject({
        value: 0,
        reference_year: 1997,
        source_id: fixtureIds.sources[0],
        village_id: fixtureIds.village,
        status: 'PENDING',
        reviewed_at: null,
        reviewed_by_id: null,
        review_note: null,
      });
    });

    it('accepts a record for the current year', async () => {
      const currentYear = new Date().getFullYear();
      const response = await postRecord({
        value: 1250,
        referenceYear: currentYear,
        sourceId: fixtureIds.sources[0],
      });

      expect(response.status).toBe(201);
      expect(response.body.referenceYear).toBe(currentYear);
      expect(response.body.status).toBe('PENDING');
    });

    it('rejects a future year with field-level validation details', async () => {
      const response = await postRecord({
        value: 100,
        referenceYear: new Date().getFullYear() + 1,
        sourceId: fixtureIds.sources[0],
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      });
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'referenceYear' }),
        ]),
      );
    });

    it.each([-1, 1.5])('rejects invalid population value %s', async (value) => {
      const response = await postRecord({
        value,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'value' })]),
      );
    });

    it('rejects a malformed source UUID with validation details', async () => {
      const response = await postRecord({
        value: 100,
        referenceYear: 1997,
        sourceId: 'not-a-uuid',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'sourceId' }),
        ]),
      );
    });

    it('returns 422 when the valid source UUID does not exist', async () => {
      const missingSourceId = randomUUID();
      const response = await postRecord({
        value: 100,
        referenceYear: 1997,
        sourceId: missingSourceId,
      });

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
      });
      expect(response.body.error.message).toContain(missingSourceId);
    });

    it('returns 404 when the valid village UUID does not exist', async () => {
      const missingVillageId = randomUUID();
      const response = await postRecord(
        {
          value: 100,
          referenceYear: 1997,
          sourceId: fixtureIds.sources[0],
        },
        missingVillageId,
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(response.body.error.message).toContain(missingVillageId);
    });

    it('rejects a malformed village ID', async () => {
      const response = await postRecord(
        {
          value: 100,
          referenceYear: 1997,
          sourceId: fixtureIds.sources[0],
        },
        'not-a-uuid',
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects an empty body with required-field details', async () => {
      const response = await postRecord({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const fields = response.body.error.details.map(
        (detail: { field: string }) => detail.field,
      );
      expect(fields).toEqual(
        expect.arrayContaining(['value', 'referenceYear', 'sourceId']),
      );
    });

    it('rejects client-controlled status and review fields', async () => {
      const response = await postRecord({
        value: 100,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
        status: 'VERIFIED',
        reviewedById: randomUUID(),
        reviewedAt: new Date().toISOString(),
        reviewNote: 'client supplied',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const fields = response.body.error.details.map(
        (detail: { field: string }) => detail.field,
      );
      expect(fields).toEqual(
        expect.arrayContaining([
          'status',
          'reviewedById',
          'reviewedAt',
          'reviewNote',
        ]),
      );
    });

    it('allows different pending figures for the same village and year', async () => {
      const first = await postRecord({
        value: 1100,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
      });
      const second = await postRecord({
        value: 1200,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.status).toBe('PENDING');
      expect(second.body.status).toBe('PENDING');
      const [{ count }] = await db().query<{ count: number }[]>(
        `SELECT count(*)::int AS count
         FROM population_records
         WHERE village_id = $1 AND reference_year = 1997`,
        [fixtureIds.village],
      );
      expect(count).toBe(2);
    });

    it('returns 409 CONFLICT for an exact duplicate figure', async () => {
      const body = {
        value: 1100,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
      };
      await postRecord(body);
      const duplicate = await postRecord(body);

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error).toMatchObject({ code: 'CONFLICT' });
      expect(duplicate.body.error.message).toContain('already exists');
      const [{ count }] = await db().query<{ count: number }[]>(
        `SELECT count(*)::int AS count
         FROM population_records
         WHERE village_id = $1 AND reference_year = 1997`,
        [fixtureIds.village],
      );
      expect(count).toBe(1);
    });
  });

  describe('GET /api/v1/villages/:villageId/population-records', () => {
    beforeEach(async () => {
      await insertRecord(1000, 1987, 'VERIFIED', fixtureIds.sources[0]);
      await insertRecord(1200, 1997, 'VERIFIED', fixtureIds.sources[1]);
      await insertRecord(1500, 2007, 'VERIFIED', fixtureIds.sources[0]);
      await insertRecord(1350, 1997, 'PENDING', fixtureIds.sources[1]);
      await insertRecord(900, 1997, 'REJECTED', fixtureIds.sources[0]);
    });

    it('defaults to VERIFIED records in ascending year order with pagination metadata', async () => {
      const response = await http().get(recordsPath()).expect(200);

      expect(
        response.body.data.map((record: { value: number }) => record.value),
      ).toEqual([1000, 1200, 1500]);
      expect(
        response.body.data.map(
          (record: { referenceYear: number }) => record.referenceYear,
        ),
      ).toEqual([1987, 1997, 2007]);
      expect(
        response.body.data.every(
          (record: { status: string }) => record.status === 'VERIFIED',
        ),
      ).toBe(true);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1,
      });
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('limit');
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('totalPages');
    });

    it('filters for PENDING status when requested', async () => {
      const response = await http()
        .get(`${recordsPath()}?status=PENDING`)
        .expect(200);

      expect(
        response.body.data.map((record: { value: number }) => record.value),
      ).toEqual([1350]);
      expect(response.body.data[0].status).toBe('PENDING');
    });

    it('filters for REJECTED status when requested', async () => {
      const response = await http()
        .get(`${recordsPath()}?status=REJECTED`)
        .expect(200);

      expect(
        response.body.data.map((record: { value: number }) => record.value),
      ).toEqual([900]);
      expect(response.body.data[0].status).toBe('REJECTED');
    });

    it('filters verified records by reference year', async () => {
      const response = await http()
        .get(`${recordsPath()}?year=1997`)
        .expect(200);

      expect(
        response.body.data.map((record: { value: number }) => record.value),
      ).toEqual([1200]);
      expect(response.body.meta.total).toBe(1);
    });

    it('filters verified records by source ID', async () => {
      const response = await http()
        .get(`${recordsPath()}?sourceId=${fixtureIds.sources[1]}`)
        .expect(200);

      expect(
        response.body.data.map((record: { value: number }) => record.value),
      ).toEqual([1200]);
      expect(response.body.data[0].sourceId).toBe(fixtureIds.sources[1]);
    });

    it('sorts by value descending', async () => {
      const response = await http()
        .get(`${recordsPath()}?sort=value&order=desc`)
        .expect(200);

      expect(
        response.body.data.map((record: { value: number }) => record.value),
      ).toEqual([1500, 1200, 1000]);
    });

    it('paginates the verified records and reports total pages', async () => {
      const response = await http()
        .get(`${recordsPath()}?page=2&limit=2`)
        .expect(200);

      expect(
        response.body.data.map((record: { value: number }) => record.value),
      ).toEqual([1500]);
      expect(response.body.meta).toEqual({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it.each([
      ['status', 'UNKNOWN'],
      ['sort', 'password'],
      ['limit', '101'],
    ])('rejects invalid query parameter %s=%s', async (key, value) => {
      const response = await http()
        .get(`${recordsPath()}?${key}=${value}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for an unknown village instead of an empty list', async () => {
      const missingVillageId = randomUUID();
      const response = await http()
        .get(recordsPath(missingVillageId))
        .expect(404);

      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
      expect(response.body.error.message).toContain(missingVillageId);
    });
  });

  describe('GET /api/v1/villages/:villageId/population-records/:id', () => {
    it('returns a pending record without exposing entity relationships', async () => {
      const id = await insertRecord(
        1350,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );

      const response = await http().get(`${recordsPath()}/${id}`).expect(200);

      expect(response.body).toMatchObject({
        id,
        villageId: fixtureIds.village,
        sourceId: fixtureIds.sources[0],
        value: 1350,
        referenceYear: 1997,
        status: 'PENDING',
      });
      expect(response.body).not.toHaveProperty('village');
      expect(response.body).not.toHaveProperty('source');
      expect(response.body).not.toHaveProperty('reviewedBy');
    });

    it('does not expose a record through another village path', async () => {
      const id = await insertRecord(
        1350,
        1997,
        'PENDING',
        fixtureIds.sources[0],
        fixtureIds.otherVillage,
      );
      const response = await http().get(`${recordsPath()}/${id}`).expect(404);

      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns 404 for an unknown record UUID', async () => {
      const response = await http()
        .get(`${recordsPath()}/${UNKNOWN_ID}`)
        .expect(404);

      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
      expect(response.body.error.message).toContain(UNKNOWN_ID);
    });

    it('returns 400 for malformed village and record UUIDs', async () => {
      const invalidVillage = await http()
        .get(`${recordsPath('not-a-uuid')}/${UNKNOWN_ID}`)
        .expect(400);
      expect(invalidVillage.body.error.code).toBe('BAD_REQUEST');

      const invalidRecord = await http()
        .get(`${recordsPath()}/not-a-uuid`)
        .expect(400);
      expect(invalidRecord.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('PATCH /api/v1/villages/:villageId/population-records/:id', () => {
    it('updates a PENDING value while preserving unspecified fields', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );

      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({ value: 1300 })
        .expect(200);

      expect(response.body).toMatchObject({
        id,
        villageId: fixtureIds.village,
        sourceId: fixtureIds.sources[0],
        value: 1300,
        referenceYear: 1997,
        status: 'PENDING',
      });
      expect(await readRecord(id)).toMatchObject({
        value: 1300,
        reference_year: 1997,
        source_id: fixtureIds.sources[0],
        status: 'PENDING',
      });
    });

    it('updates to another existing source', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );

      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({ sourceId: fixtureIds.sources[1] })
        .expect(200);

      expect(response.body.sourceId).toBe(fixtureIds.sources[1]);
      expect(response.body.value).toBe(1200);
      expect(response.body.referenceYear).toBe(1997);
      expect(await readRecord(id)).toMatchObject({
        source_id: fixtureIds.sources[1],
        value: 1200,
        reference_year: 1997,
      });
    });

    it('returns 422 for an unknown source and leaves the record unchanged', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );
      const missingSourceId = randomUUID();

      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({ sourceId: missingSourceId })
        .expect(422);

      expect(response.body.error).toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
      });
      expect(response.body.error.message).toContain(missingSourceId);
      expect(await readRecord(id)).toMatchObject({
        value: 1200,
        reference_year: 1997,
        source_id: fixtureIds.sources[0],
      });
    });

    it('rejects a future year with details and leaves the record unchanged', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );
      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({ referenceYear: new Date().getFullYear() + 1 })
        .expect(400);

      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      });
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'referenceYear' }),
        ]),
      );
      expect(await readRecord(id)).toMatchObject({
        value: 1200,
        reference_year: 1997,
        source_id: fixtureIds.sources[0],
      });
    });

    it.each([
      ['value', { value: null }],
      ['referenceYear', { referenceYear: null }],
      ['sourceId', { sourceId: null }],
    ])('rejects explicit null for %s', async (_field, body) => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );
      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send(body)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await readRecord(id)).toMatchObject({
        value: 1200,
        reference_year: 1997,
        source_id: fixtureIds.sources[0],
      });
    });

    it('rejects a negative population value', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );
      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({ value: -1 })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'value' })]),
      );
      expect(await readRecord(id)).toMatchObject({ value: 1200 });
    });

    it('rejects client-supplied status and review metadata', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );
      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({
          value: 1300,
          status: 'VERIFIED',
          reviewedAt: new Date().toISOString(),
          reviewedById: randomUUID(),
          reviewNote: 'client supplied',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const fields = response.body.error.details.map(
        (detail: { field: string }) => detail.field,
      );
      expect(fields).toEqual(
        expect.arrayContaining([
          'status',
          'reviewedAt',
          'reviewedById',
          'reviewNote',
        ]),
      );
      expect(await readRecord(id)).toMatchObject({
        value: 1200,
        status: 'PENDING',
        reviewed_at: null,
        reviewed_by_id: null,
        review_note: null,
      });
    });

    it.each(['VERIFIED', 'REJECTED'] as const)(
      'returns 409 when updating a %s record and preserves it',
      async (status) => {
        const id = await insertRecord(
          1200,
          1997,
          status,
          fixtureIds.sources[0],
        );
        const response = await http()
          .patch(`${recordsPath()}/${id}`)
          .send({ value: 1300 })
          .expect(409);

        expect(response.body.error).toMatchObject({ code: 'CONFLICT' });
        expect(response.body.error.message).toContain('PENDING');
        expect(await readRecord(id)).toMatchObject({
          value: 1200,
          status,
        });
      },
    );

    it('returns 409 when an update creates a duplicate figure', async () => {
      const id = await insertRecord(
        1000,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );
      await insertRecord(1200, 1997, 'PENDING', fixtureIds.sources[0]);

      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({ value: 1200 })
        .expect(409);

      expect(response.body.error).toMatchObject({ code: 'CONFLICT' });
      expect(response.body.error.message).toContain('already exists');
      expect(await readRecord(id)).toMatchObject({
        value: 1000,
        reference_year: 1997,
        source_id: fixtureIds.sources[0],
      });
    });

    it('returns 404 for an unknown record', async () => {
      const response = await http()
        .patch(`${recordsPath()}/${UNKNOWN_ID}`)
        .send({ value: 1300 })
        .expect(404);

      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns 400 for malformed village and record UUIDs', async () => {
      const invalidVillage = await http()
        .patch(`${recordsPath('not-a-uuid')}/${UNKNOWN_ID}`)
        .send({ value: 1300 })
        .expect(400);
      expect(invalidVillage.body.error.code).toBe('BAD_REQUEST');

      const invalidRecord = await http()
        .patch(`${recordsPath()}/not-a-uuid`)
        .send({ value: 1300 })
        .expect(400);
      expect(invalidRecord.body.error.code).toBe('BAD_REQUEST');
    });

    it('accepts an empty patch and returns unchanged values', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'PENDING',
        fixtureIds.sources[0],
      );

      const response = await http()
        .patch(`${recordsPath()}/${id}`)
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({
        id,
        value: 1200,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
        status: 'PENDING',
      });
      expect(await readRecord(id)).toMatchObject({
        value: 1200,
        reference_year: 1997,
        source_id: fixtureIds.sources[0],
        status: 'PENDING',
      });
    });
  });

  describe('DELETE /api/v1/villages/:villageId/population-records/:id', () => {
    it.each(['PENDING', 'REJECTED'] as const)(
      'deletes a %s record with 204 and subsequent GET returns 404',
      async (status) => {
        const id = await insertRecord(
          1200,
          1997,
          status,
          fixtureIds.sources[0],
        );

        const response = await http()
          .delete(`${recordsPath()}/${id}`)
          .expect(204);

        expect(response.text).toBe('');
        expect(await readRecord(id)).toBeUndefined();
        const getResponse = await http()
          .get(`${recordsPath()}/${id}`)
          .expect(404);
        expect(getResponse.body.error.code).toBe('NOT_FOUND');
      },
    );

    it('returns 409 for a VERIFIED record and leaves it intact', async () => {
      const id = await insertRecord(
        1200,
        1997,
        'VERIFIED',
        fixtureIds.sources[0],
      );

      const response = await http()
        .delete(`${recordsPath()}/${id}`)
        .expect(409);

      expect(response.body.error).toMatchObject({ code: 'CONFLICT' });
      expect(response.body.error.message).toContain('VERIFIED');
      expect(await readRecord(id)).toMatchObject({
        id,
        value: 1200,
        status: 'VERIFIED',
      });
    });

    it('returns 404 for an unknown record', async () => {
      const response = await http()
        .delete(`${recordsPath()}/${UNKNOWN_ID}`)
        .expect(404);

      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('returns 400 for malformed village and record UUIDs', async () => {
      const invalidVillage = await http()
        .delete(`${recordsPath('not-a-uuid')}/${UNKNOWN_ID}`)
        .expect(400);
      expect(invalidVillage.body.error.code).toBe('BAD_REQUEST');

      const invalidRecord = await http()
        .delete(`${recordsPath()}/not-a-uuid`)
        .expect(400);
      expect(invalidRecord.body.error.code).toBe('BAD_REQUEST');
    });
  });
});
