import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createTestApp } from './utils/create-test-app';

type PopulationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  village: randomUUID(),
  sources: [randomUUID(), randomUUID()] as const,
};
const UNKNOWN_VILLAGE_ID = '00000000-0000-4000-8000-000000000000';

describe('Population history (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  const populationRecordIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The test database is not initialized');
    }
    return dataSource;
  };

  const historyPath = (villageId: string = fixtureIds.village) =>
    `/api/v1/villages/${villageId}/population-history`;

  const insertRecord = async (
    referenceYear: number,
    value: number,
    status: PopulationStatus,
    sourceId: string = fixtureIds.sources[0],
  ): Promise<string> => {
    const id = randomUUID();
    await db().query(
      `INSERT INTO population_records
         (id, village_id, source_id, value, reference_year, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, fixtureIds.village, sourceId, value, referenceYear, status],
    );
    populationRecordIds.add(id);
    return id;
  };

  const cleanupPopulationRecords = async (): Promise<void> => {
    const ids = [...populationRecordIds];
    if (ids.length > 0) {
      await db().query(
        'DELETE FROM population_records WHERE id = ANY($1::uuid[])',
        [ids],
      );
      populationRecordIds.clear();
    }
  };

  const cleanupFixtures = async (): Promise<void> => {
    if (!dataSource) {
      return;
    }
    await cleanupPopulationRecords();
    await db().query('DELETE FROM villages WHERE id = $1', [
      fixtureIds.village,
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

    await db().query(
      `INSERT INTO governorates (id, name_ar, name_en)
       VALUES ($1, $2, $3)`,
      [
        fixtureIds.governorate,
        `E2E-HISTORY-${fixtureToken}`,
        `E2E Population History ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4)`,
      [
        fixtureIds.village,
        `E2E-HISTORY-${fixtureToken}-village`,
        `E2E Population History Village ${fixtureToken}`,
        fixtureIds.governorate,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type, author, url, year)
       VALUES
         ($1, $2, 'BOOK', $3, $4, $5),
         ($6, $7, 'SURVEY', $8, $9, $10)`,
      [
        fixtureIds.sources[0],
        `E2E History Census ${fixtureToken}`,
        `Author One ${fixtureToken}`,
        `https://example.test/history/${fixtureToken}/one`,
        1997,
        fixtureIds.sources[1],
        `E2E History Survey ${fixtureToken}`,
        `Author Two ${fixtureToken}`,
        `https://example.test/history/${fixtureToken}/two`,
        2007,
      ],
    );
  }, 30000);

  afterEach(async () => {
    if (dataSource) {
      await cleanupPopulationRecords();
    }
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  it('returns verified observations chronologically and calculates changes only between them', async () => {
    await insertRecord(1997, 1200, 'VERIFIED');
    await insertRecord(1999, 1400, 'PENDING');
    await insertRecord(2000, 900, 'REJECTED');
    await insertRecord(2007, 1500, 'VERIFIED', fixtureIds.sources[1]);
    await insertRecord(2017, 1900, 'VERIFIED');
    await insertRecord(2017, 2100, 'PENDING', fixtureIds.sources[1]);
    await insertRecord(2017, 800, 'REJECTED');
    await insertRecord(2022, 1700, 'VERIFIED', fixtureIds.sources[1]);

    const response = await request(app!.getHttpServer()).get(historyPath());

    expect(response.status).toBe(200);
    expect(
      response.body.data.map(
        (record: { referenceYear: number }) => record.referenceYear,
      ),
    ).toEqual([1997, 2007, 2017, 2022]);
    expect(
      response.body.data.map(
        (record: {
          previousReferenceYear: number | null;
          previousValue: number | null;
          populationChange: number | null;
        }) => [
          record.previousReferenceYear,
          record.previousValue,
          record.populationChange,
        ],
      ),
    ).toEqual([
      [null, null, null],
      [1997, 1200, 300],
      [2007, 1500, 400],
      [2017, 1900, -200],
    ]);
    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 4,
      totalPages: 1,
    });
  });

  it('paginates without resetting the previous observation on later pages', async () => {
    await insertRecord(1997, 1200, 'VERIFIED');
    await insertRecord(2007, 1500, 'VERIFIED', fixtureIds.sources[1]);
    await insertRecord(2017, 1900, 'VERIFIED');
    await insertRecord(2022, 1700, 'VERIFIED', fixtureIds.sources[1]);

    const firstPage = await request(app!.getHttpServer())
      .get(historyPath())
      .query({ page: 1, limit: 2 });
    const secondPage = await request(app!.getHttpServer())
      .get(historyPath())
      .query({ page: 2, limit: 2 });
    const emptyPage = await request(app!.getHttpServer())
      .get(historyPath())
      .query({ page: 3, limit: 2 });

    expect(firstPage.status).toBe(200);
    expect(
      firstPage.body.data.map(
        (record: { referenceYear: number }) => record.referenceYear,
      ),
    ).toEqual([1997, 2007]);
    expect(firstPage.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
    });

    expect(secondPage.status).toBe(200);
    expect(
      secondPage.body.data.map(
        (record: { referenceYear: number }) => record.referenceYear,
      ),
    ).toEqual([2017, 2022]);
    expect(secondPage.body.data[0]).toMatchObject({
      previousReferenceYear: 2007,
      previousValue: 1500,
      populationChange: 400,
    });
    expect(secondPage.body.meta).toEqual({
      page: 2,
      limit: 2,
      total: 4,
      totalPages: 2,
    });

    expect(emptyPage.status).toBe(200);
    expect(emptyPage.body.data).toEqual([]);
    expect(emptyPage.body.meta).toEqual({
      page: 3,
      limit: 2,
      total: 4,
      totalPages: 2,
    });
  });

  it('includes the correct source provenance for each observation', async () => {
    await insertRecord(1997, 1200, 'VERIFIED', fixtureIds.sources[0]);
    await insertRecord(2007, 1500, 'VERIFIED', fixtureIds.sources[1]);

    const response = await request(app!.getHttpServer()).get(historyPath());

    expect(response.status).toBe(200);
    expect(
      response.body.data.map((record: { source: object }) => record.source),
    ).toEqual([
      {
        id: fixtureIds.sources[0],
        title: `E2E History Census ${fixtureToken}`,
        type: 'BOOK',
        author: `Author One ${fixtureToken}`,
        url: `https://example.test/history/${fixtureToken}/one`,
        year: 1997,
      },
      {
        id: fixtureIds.sources[1],
        title: `E2E History Survey ${fixtureToken}`,
        type: 'SURVEY',
        author: `Author Two ${fixtureToken}`,
        url: `https://example.test/history/${fixtureToken}/two`,
        year: 2007,
      },
    ]);
  });

  it('returns an empty result when the village has no verified population data', async () => {
    await insertRecord(1997, 1200, 'PENDING');
    await insertRecord(2007, 1500, 'REJECTED', fixtureIds.sources[1]);

    const response = await request(app!.getHttpServer()).get(historyPath());

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('returns 404 for an unknown village UUID', async () => {
    const response = await request(app!.getHttpServer()).get(
      historyPath(UNKNOWN_VILLAGE_ID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a malformed village UUID', async () => {
    const response = await request(app!.getHttpServer()).get(
      historyPath('not-a-uuid'),
    );

    expect(response.status).toBe(400);
  });

  it.each([
    ['page', '0'],
    ['limit', '101'],
    ['sort', 'value'],
    ['order', 'desc'],
  ])('returns 400 for invalid %s query values', async (key, value) => {
    const response = await request(app!.getHttpServer())
      .get(historyPath())
      .query({ [key]: value });

    expect(response.status).toBe(400);
  });
});
