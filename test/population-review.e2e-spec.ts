import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { PopulationRecord } from '../src/modules/population/entities/population-record.entity';
import { PopulationService } from '../src/modules/population/population.service';
import type { PopulationReviewerContext } from '../src/modules/population/population.service';
import { VerificationStatus } from '../src/modules/source/verification/verification-status.enum';
import { UsersService } from '../src/modules/users/users.service';
import { createTestApp } from './utils/create-test-app';

interface PopulationRow {
  id: string;
  village_id: string;
  source_id: string;
  value: number;
  reference_year: number;
  status: VerificationStatus;
  reviewed_at: Date | null;
  reviewed_by_id: string | null;
  review_note: string | null;
}

const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  village: randomUUID(),
  sources: [randomUUID(), randomUUID()] as const,
};

describe('Population review (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let populationService: PopulationService | undefined;
  let populationRecords: Repository<PopulationRecord> | undefined;
  let reviewerId: string | undefined;
  const populationRecordIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The test database is not initialized');
    }
    return dataSource;
  };

  const recordsPath = () =>
    `/api/v1/villages/${fixtureIds.village}/population-records`;

  const reviewService = (): PopulationService => {
    if (!populationService) {
      throw new Error('The test application is not initialized');
    }
    return populationService;
  };

  const testReviewer = (): PopulationReviewerContext => {
    if (!reviewerId) {
      throw new Error('The test reviewer is not initialized');
    }
    return { reviewerId };
  };

  const insertRecord = async (
    referenceYear: number,
    value: number,
    status: VerificationStatus = VerificationStatus.PENDING,
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

  const readRecord = async (id: string): Promise<PopulationRow | undefined> => {
    const rows = await db().query<PopulationRow[]>(
      `SELECT id, village_id, source_id, value, reference_year, status,
              reviewed_at, reviewed_by_id, review_note
       FROM population_records
       WHERE id = $1`,
      [id],
    );
    return rows[0];
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
    if (reviewerId) {
      await db().query('DELETE FROM users WHERE id = $1', [reviewerId]);
    }
    await db().query('DELETE FROM governorates WHERE id = $1', [
      fixtureIds.governorate,
    ]);
  };

  beforeAll(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      process.env.DB_NAME !== 'qaryati_test'
    ) {
      throw new Error(
        'Population review E2E tests require NODE_ENV=test and DB_NAME=qaryati_test',
      );
    }

    app = await createTestApp();
    dataSource = app.get(DataSource);
    populationService = app.get(PopulationService);
    populationRecords = app.get<Repository<PopulationRecord>>(
      getRepositoryToken(PopulationRecord),
    );
    const databaseRows = await db().query<{ databaseName: string }[]>(
      'SELECT current_database() AS "databaseName"',
    );
    if (databaseRows[0]?.databaseName !== 'qaryati_test') {
      throw new Error('Connected to an unexpected E2E database');
    }

    await db().query(
      `INSERT INTO governorates (id, name_ar, name_en)
       VALUES ($1, $2, $3)`,
      [
        fixtureIds.governorate,
        `E2E-REVIEW-${fixtureToken}`,
        `E2E Population Review ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4)`,
      [
        fixtureIds.village,
        `E2E-REVIEW-${fixtureToken}-village`,
        `E2E Population Review Village ${fixtureToken}`,
        fixtureIds.governorate,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'SURVEY'), ($3, $4, 'BOOK')`,
      [
        fixtureIds.sources[0],
        `E2E Review Source One ${fixtureToken}`,
        fixtureIds.sources[1],
        `E2E Review Source Two ${fixtureToken}`,
      ],
    );

    const reviewer = await app.get(UsersService).create({
      email: `population-review-${fixtureToken}@example.com`,
      passwordHash: 'test-only-password-hash',
      displayName: `E2E reviewer ${fixtureToken}`,
      role: Role.VERIFIER,
    });
    reviewerId = reviewer.id;
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

  it('rejects anonymous verification without changing the record', async () => {
    const id = await insertRecord(1997, 1200);
    const before = await readRecord(id);

    const response = await request(app!.getHttpServer())
      .post(`${recordsPath()}/${id}/verify`)
      .send({ reviewNote: 'Looks correct' });

    expect(response.status).toBe(401);
    expect(await readRecord(id)).toEqual(before);
  });

  it('rejects anonymous rejection without changing the record', async () => {
    const id = await insertRecord(1997, 1200);
    const before = await readRecord(id);

    const response = await request(app!.getHttpServer())
      .post(`${recordsPath()}/${id}/reject`)
      .send({ reviewNote: 'Insufficient evidence' });

    expect(response.status).toBe(401);
    expect(await readRecord(id)).toEqual(before);
  });

  it('does not trust forged user IDs, roles, or review fields', async () => {
    const id = await insertRecord(1997, 1200);
    const before = await readRecord(id);

    const response = await request(app!.getHttpServer())
      .post(`${recordsPath()}/${id}/verify`)
      .set('x-user-id', testReviewer().reviewerId)
      .set('x-role', 'ADMIN')
      .send({
        reviewerId,
        reviewedById: reviewerId,
        reviewedAt: new Date().toISOString(),
        role: 'ADMIN',
        status: 'VERIFIED',
      });

    expect(response.status).toBe(401);
    expect(await readRecord(id)).toEqual(before);
  });

  it('keeps existing population CRUD and history endpoints available', async () => {
    const created = await request(app!.getHttpServer())
      .post(recordsPath())
      .send({
        value: 1200,
        referenceYear: 1997,
        sourceId: fixtureIds.sources[0],
      });
    expect(created.status).toBe(201);
    const createdId: unknown = created.body.id;
    if (typeof createdId !== 'string') {
      throw new Error('Expected the created record response to contain an ID');
    }
    populationRecordIds.add(createdId);

    const records = await request(app!.getHttpServer())
      .get(recordsPath())
      .query({ status: 'PENDING' });
    const history = await request(app!.getHttpServer()).get(
      `/api/v1/villages/${fixtureIds.village}/population-history`,
    );

    expect(records.status).toBe(200);
    expect(
      records.body.data.map((record: { id: string }) => record.id),
    ).toEqual([created.body.id]);
    expect(history.status).toBe(200);
    expect(history.body.data).toEqual([]);
  });

  it('persists PENDING to VERIFIED and its review metadata', async () => {
    const id = await insertRecord(1997, 1200);

    const result = await reviewService().verify(
      fixtureIds.village,
      id,
      testReviewer(),
      { reviewNote: 'Evidence confirmed' },
    );
    const row = await readRecord(id);

    expect(result.status).toBe(VerificationStatus.VERIFIED);
    expect(result.reviewedById).toBe(reviewerId);
    expect(result.reviewNote).toBe('Evidence confirmed');
    expect(result.reviewedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({
      status: VerificationStatus.VERIFIED,
      reviewed_by_id: reviewerId,
      review_note: 'Evidence confirmed',
    });
    expect(row?.reviewed_at).toBeInstanceOf(Date);
  });

  it('persists PENDING to REJECTED and its review metadata', async () => {
    const id = await insertRecord(1997, 1200);

    const result = await reviewService().reject(
      fixtureIds.village,
      id,
      testReviewer(),
      {
        reviewNote: 'Conflicts with the source',
      },
    );
    const row = await readRecord(id);

    expect(result.status).toBe(VerificationStatus.REJECTED);
    expect(result.reviewedById).toBe(reviewerId);
    expect(result.reviewNote).toBe('Conflicts with the source');
    expect(row).toMatchObject({
      status: VerificationStatus.REJECTED,
      reviewed_by_id: reviewerId,
      review_note: 'Conflicts with the source',
    });
  });

  it('allows VERIFIED to transition to REJECTED', async () => {
    const id = await insertRecord(1997, 1200, VerificationStatus.VERIFIED);

    const result = await reviewService().reject(
      fixtureIds.village,
      id,
      testReviewer(),
      { reviewNote: 'Later evidence disproved it' },
    );

    expect(result.status).toBe(VerificationStatus.REJECTED);
    expect((await readRecord(id))?.status).toBe(VerificationStatus.REJECTED);
  });

  it.each([
    [VerificationStatus.REJECTED, 'verify'],
    [VerificationStatus.REJECTED, 'reject'],
    [VerificationStatus.VERIFIED, 'verify'],
  ] as const)(
    'returns 409 when transitioning %s with %s',
    async (status, action) => {
      const id = await insertRecord(1997, 1200, status);
      const operation =
        action === 'verify'
          ? reviewService().verify(fixtureIds.village, id, testReviewer(), {})
          : reviewService().reject(fixtureIds.village, id, testReviewer(), {
              reviewNote: 'Attempt to repeat rejection',
            });

      await expect(operation).rejects.toBeInstanceOf(ConflictException);
      expect((await readRecord(id))?.status).toBe(status);
    },
  );

  it('prevents a second VERIFIED figure for the same village and year', async () => {
    const firstId = await insertRecord(1997, 1200);
    const secondId = await insertRecord(
      1997,
      1300,
      VerificationStatus.PENDING,
      fixtureIds.sources[1],
    );

    await reviewService().verify(
      fixtureIds.village,
      firstId,
      testReviewer(),
      {},
    );
    await expect(
      reviewService().verify(fixtureIds.village, secondId, testReviewer(), {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect((await readRecord(firstId))?.status).toBe(
      VerificationStatus.VERIFIED,
    );
    expect((await readRecord(secondId))?.status).toBe(
      VerificationStatus.PENDING,
    );
  });

  it('allows only one of two concurrent reviews of the same PENDING record', async () => {
    if (!populationRecords) {
      throw new Error('Population repository is not initialized');
    }
    const id = await insertRecord(1997, 1200);
    const repository = populationRecords;
    const originalFindOneBy = repository.findOneBy.bind(repository);
    let reads = 0;
    let releaseReads!: () => void;
    const bothReadsComplete = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const findOneSpy = jest
      .spyOn(repository, 'findOneBy')
      .mockImplementation(async (criteria) => {
        const record = await originalFindOneBy(criteria);
        if (!Array.isArray(criteria) && criteria.id === id) {
          reads += 1;
          if (reads === 2) {
            releaseReads();
          }
          await bothReadsComplete;
        }
        return record;
      });

    try {
      const results = await Promise.allSettled([
        reviewService().verify(fixtureIds.village, id, testReviewer(), {}),
        reviewService().reject(fixtureIds.village, id, testReviewer(), {
          reviewNote: 'Competing decision',
        }),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      expect(rejected?.reason).toBeInstanceOf(ConflictException);
      expect([
        VerificationStatus.VERIFIED,
        VerificationStatus.REJECTED,
      ]).toContain((await readRecord(id))?.status);
    } finally {
      findOneSpy.mockRestore();
    }
  });
});
