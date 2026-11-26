import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { Landmark } from '../src/modules/heritage/entities/landmark.entity';
import { UsersService } from '../src/modules/users/users.service';
import { VerificationStatus } from '../src/modules/source/verification/verification-status.enum';
import { createTestApp } from './utils/create-test-app';

const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  village: randomUUID(),
  sources: [randomUUID(), randomUUID()] as const,
};
const LANDMARK_TYPES = [
  'SPRING',
  'RELIGIOUS_SITE',
  'ARCHAEOLOGICAL_SITE',
  'OLD_BUILDING',
  'VIEWPOINT',
];

describe('landmarks data model (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let reviewerId: string | undefined;
  const landmarkIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The isolated test database is not initialized');
    }
    return dataSource;
  };

  const insertLandmark = async (
    options: {
      status?: VerificationStatus;
      reviewedById?: string;
      type?: string;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await db().query(
      `INSERT INTO landmarks
         (id, village_id, source_id, name, type, description, status,
          reviewed_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        fixtureIds.village,
        fixtureIds.sources[0],
        `E2E Landmark ${fixtureToken}`,
        options.type ?? 'SPRING',
        'Test landmark description',
        options.status ?? VerificationStatus.PENDING,
        options.reviewedById ?? null,
      ],
    );
    landmarkIds.add(id);
    return id;
  };

  const cleanupLandmarks = async (): Promise<void> => {
    const ids = [...landmarkIds];
    if (ids.length > 0) {
      await db().query('DELETE FROM landmarks WHERE id = ANY($1::uuid[])', [
        ids,
      ]);
      landmarkIds.clear();
    }
  };

  const cleanupFixtures = async (): Promise<void> => {
    if (!dataSource) return;
    await cleanupLandmarks();
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
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await db().query(
      `INSERT INTO governorates (id, name_ar, name_en)
       VALUES ($1, $2, $3)`,
      [
        fixtureIds.governorate,
        `E2E-LANDMARK-MODEL-${fixtureToken}`,
        `E2E Landmark Model ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4)`,
      [
        fixtureIds.village,
        `E2E-LANDMARK-MODEL-${fixtureToken}`,
        `E2E Landmark Model Village ${fixtureToken}`,
        fixtureIds.governorate,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'BOOK'), ($3, $4, 'SURVEY')`,
      [
        fixtureIds.sources[0],
        `E2E Landmark Model Source One ${fixtureToken}`,
        fixtureIds.sources[1],
        `E2E Landmark Model Source Two ${fixtureToken}`,
      ],
    );
    const reviewer = await app.get(UsersService).create({
      email: `landmark-model-reviewer-${fixtureToken}@example.test`,
      passwordHash: 'test-only-password-hash',
      displayName: `E2E Landmark Model Reviewer ${fixtureToken}`,
      role: Role.VERIFIER,
    });
    reviewerId = reviewer.id;
  }, 30000);

  afterEach(async () => cleanupLandmarks());

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  it('runs the Landmark migration and matches entity columns to PostgreSQL', async () => {
    const [{ exists }] = await db().query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM migrations
         WHERE name = 'CreateLandmarks1795710251794'
       ) AS exists`,
    );
    expect(exists).toBe(true);

    const entityColumns = db()
      .getMetadata(Landmark)
      .columns.map((column) => column.databaseName)
      .sort();
    const actualColumns = (
      await db().query<{ column_name: string }[]>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'landmarks'`,
      )
    )
      .map((column) => column.column_name)
      .sort();
    expect(actualColumns).toEqual(entityColumns);
    expect(actualColumns).toEqual(
      [
        'id',
        'village_id',
        'source_id',
        'name',
        'type',
        'description',
        'status',
        'reviewed_at',
        'reviewed_by_id',
        'review_note',
        'created_at',
        'updated_at',
      ].sort(),
    );
  });

  it('creates the expected enum values, foreign keys, and indexes', async () => {
    const enumRows = await db().query<{ enumlabel: string }[]>(
      `SELECT enumlabel
       FROM pg_enum
       WHERE enumtypid = 'landmark_type'::regtype
       ORDER BY enumsortorder`,
    );
    expect(enumRows.map(({ enumlabel }) => enumlabel)).toEqual(LANDMARK_TYPES);

    const foreignKeys = await db().query<
      { conname: string; confdeltype: string }[]
    >(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'landmarks'::regclass AND contype = 'f'`,
    );
    expect(
      foreignKeys
        .map(({ conname, confdeltype }) => [conname, confdeltype])
        .sort(),
    ).toEqual(
      [
        ['landmarks_reviewed_by_id_fkey', 'r'],
        ['landmarks_source_id_fkey', 'r'],
        ['landmarks_village_id_fkey', 'r'],
      ].sort(),
    );

    const indexes = await db().query<{ indexname: string }[]>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = current_schema() AND tablename = 'landmarks'`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'idx_landmarks_village_id',
        'idx_landmarks_source_id',
      ]),
    );
  });

  it('defaults new rows to PENDING with null review fields and timestamps', async () => {
    const id = await insertLandmark();
    const [row] = await db().query<
      {
        status: VerificationStatus;
        reviewed_at: Date | null;
        reviewed_by_id: string | null;
        review_note: string | null;
        created_at: Date;
        updated_at: Date;
      }[]
    >(
      `SELECT status, reviewed_at, reviewed_by_id, review_note,
              created_at, updated_at
       FROM landmarks WHERE id = $1`,
      [id],
    );

    expect(row).toMatchObject({
      status: VerificationStatus.PENDING,
      reviewed_at: null,
      reviewed_by_id: null,
      review_note: null,
    });
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it('enforces Village and Source references and restricts their deletion', async () => {
    await expect(
      db().query(
        `INSERT INTO landmarks
           (village_id, source_id, name, type, description)
         VALUES ($1, $2, 'Missing village', 'SPRING', 'Description')`,
        [randomUUID(), fixtureIds.sources[0]],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'landmarks_village_id_fkey',
    });
    await expect(
      db().query(
        `INSERT INTO landmarks
           (village_id, source_id, name, type, description)
         VALUES ($1, $2, 'Missing source', 'SPRING', 'Description')`,
        [fixtureIds.village, randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'landmarks_source_id_fkey',
    });

    const id = await insertLandmark({ reviewedById: reviewerId });
    await expect(
      db().query('DELETE FROM villages WHERE id = $1', [fixtureIds.village]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'landmarks_village_id_fkey',
    });
    await expect(
      db().query('DELETE FROM sources WHERE id = $1', [fixtureIds.sources[0]]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'landmarks_source_id_fkey',
    });
    await expect(
      db().query('DELETE FROM users WHERE id = $1', [reviewerId]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'landmarks_reviewed_by_id_fkey',
    });
    await expect(
      db().query('SELECT id FROM landmarks WHERE id = $1', [id]),
    ).resolves.toHaveLength(1);
  });

  it('allows multiple landmarks of the same type in one village', async () => {
    await insertLandmark({ type: 'SPRING' });
    await insertLandmark({ type: 'SPRING' });

    const [{ count }] = await db().query<{ count: number }[]>(
      `SELECT count(*)::int AS count
       FROM landmarks WHERE village_id = $1 AND type = 'SPRING'`,
      [fixtureIds.village],
    );
    expect(count).toBe(2);
  });

  it('has no TypeORM schema drift', async () => {
    const schema = await db().driver.createSchemaBuilder().log();

    expect(schema.upQueries).toEqual([]);
  });
});
