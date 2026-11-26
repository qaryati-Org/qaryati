import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { CulturalTrait } from '../src/modules/heritage/entities/cultural-trait.entity';
import { UsersService } from '../src/modules/users/users.service';
import { VerificationStatus } from '../src/modules/source/verification/verification-status.enum';
import { createTestApp } from './utils/create-test-app';

const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  village: randomUUID(),
  sources: [randomUUID(), randomUUID()] as const,
};
const CULTURAL_TRAIT_TYPES = ['CRAFT', 'FOOD', 'FARMING_PRACTICE'];

describe('cultural traits data model (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let reviewerId: string | undefined;
  const culturalTraitIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The isolated test database is not initialized');
    }
    return dataSource;
  };

  const insertCulturalTrait = async (
    options: {
      status?: VerificationStatus;
      reviewedById?: string | null;
      type?: string;
    } = {},
  ): Promise<string> => {
    const id = randomUUID();
    await db().query(
      `INSERT INTO cultural_traits
         (id, village_id, source_id, type, name, description, status,
          reviewed_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        fixtureIds.village,
        fixtureIds.sources[0],
        options.type ?? 'CRAFT',
        `E2E Cultural Trait ${fixtureToken}`,
        'Test cultural trait description',
        options.status ?? VerificationStatus.PENDING,
        options.reviewedById ?? null,
      ],
    );
    culturalTraitIds.add(id);
    return id;
  };

  const cleanupCulturalTraits = async (): Promise<void> => {
    const ids = [...culturalTraitIds];
    if (ids.length > 0) {
      await db().query(
        'DELETE FROM cultural_traits WHERE id = ANY($1::uuid[])',
        [ids],
      );
      culturalTraitIds.clear();
    }
  };

  const cleanupFixtures = async (): Promise<void> => {
    if (!dataSource) return;
    await cleanupCulturalTraits();
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
        `E2E-CULTURAL-TRAIT-MODEL-${fixtureToken}`,
        `E2E Cultural Trait Model ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4)`,
      [
        fixtureIds.village,
        `E2E-CULTURAL-TRAIT-MODEL-${fixtureToken}`,
        `E2E Cultural Trait Model Village ${fixtureToken}`,
        fixtureIds.governorate,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'BOOK'), ($3, $4, 'SURVEY')`,
      [
        fixtureIds.sources[0],
        `E2E Cultural Trait Model Source One ${fixtureToken}`,
        fixtureIds.sources[1],
        `E2E Cultural Trait Model Source Two ${fixtureToken}`,
      ],
    );
    const reviewer = await app.get(UsersService).create({
      email: `cultural-trait-model-reviewer-${fixtureToken}@example.test`,
      passwordHash: 'test-only-password-hash',
      displayName: `E2E Cultural Trait Model Reviewer ${fixtureToken}`,
      role: Role.VERIFIER,
    });
    reviewerId = reviewer.id;
  }, 30000);

  afterEach(async () => cleanupCulturalTraits());

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  it('runs the Cultural Trait migration and matches entity columns to PostgreSQL', async () => {
    const [{ exists }] = await db().query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM migrations
         WHERE name = 'CreateCulturalTraits1795714188328'
       ) AS exists`,
    );
    expect(exists).toBe(true);

    const entityColumns = db()
      .getMetadata(CulturalTrait)
      .columns.map((column) => column.databaseName)
      .sort();
    const actualColumns = (
      await db().query<{ column_name: string }[]>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'cultural_traits'`,
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
        'type',
        'name',
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

  it('creates the ordered enum values, restrictive foreign keys, and indexes', async () => {
    const enumRows = await db().query<{ enumlabel: string }[]>(
      `SELECT enumlabel
       FROM pg_enum
       WHERE enumtypid = 'cultural_trait_type'::regtype
       ORDER BY enumsortorder`,
    );
    expect(enumRows.map(({ enumlabel }) => enumlabel)).toEqual(
      CULTURAL_TRAIT_TYPES,
    );

    const foreignKeys = await db().query<
      { conname: string; confdeltype: string }[]
    >(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'cultural_traits'::regclass AND contype = 'f'`,
    );
    expect(
      foreignKeys
        .map(({ conname, confdeltype }) => [conname, confdeltype])
        .sort(),
    ).toEqual(
      [
        ['cultural_traits_reviewed_by_id_fkey', 'r'],
        ['cultural_traits_source_id_fkey', 'r'],
        ['cultural_traits_village_id_fkey', 'r'],
      ].sort(),
    );

    const indexes = await db().query<{ indexname: string }[]>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = current_schema()
         AND tablename = 'cultural_traits'`,
    );
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'idx_cultural_traits_village_id',
        'idx_cultural_traits_source_id',
      ]),
    );
  });

  it('defaults new rows to PENDING with null review fields and timestamps', async () => {
    const id = randomUUID();
    await db().query(
      `INSERT INTO cultural_traits
         (id, village_id, source_id, type, name, description)
       VALUES ($1, $2, $3, 'CRAFT', $4, $5)`,
      [
        id,
        fixtureIds.village,
        fixtureIds.sources[0],
        `E2E Cultural Trait ${fixtureToken}`,
        'Test cultural trait description',
      ],
    );
    culturalTraitIds.add(id);

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
       FROM cultural_traits WHERE id = $1`,
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

  it('enforces Village, Source, and reviewer references and restricts deletion', async () => {
    await expect(
      db().query(
        `INSERT INTO cultural_traits
           (village_id, source_id, type, name, description)
         VALUES ($1, $2, 'CRAFT', 'Missing village', 'Description')`,
        [randomUUID(), fixtureIds.sources[0]],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'cultural_traits_village_id_fkey',
    });
    await expect(
      db().query(
        `INSERT INTO cultural_traits
           (village_id, source_id, type, name, description)
         VALUES ($1, $2, 'CRAFT', 'Missing source', 'Description')`,
        [fixtureIds.village, randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'cultural_traits_source_id_fkey',
    });
    await expect(
      db().query(
        `INSERT INTO cultural_traits
           (village_id, source_id, type, name, description, reviewed_by_id)
         VALUES ($1, $2, 'CRAFT', 'Missing reviewer', 'Description', $3)`,
        [fixtureIds.village, fixtureIds.sources[0], randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'cultural_traits_reviewed_by_id_fkey',
    });

    const id = await insertCulturalTrait({ reviewedById: reviewerId });
    await expect(
      db().query('DELETE FROM villages WHERE id = $1', [fixtureIds.village]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'cultural_traits_village_id_fkey',
    });
    await expect(
      db().query('DELETE FROM sources WHERE id = $1', [fixtureIds.sources[0]]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'cultural_traits_source_id_fkey',
    });
    await expect(
      db().query('DELETE FROM users WHERE id = $1', [reviewerId]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'cultural_traits_reviewed_by_id_fkey',
    });
    await expect(
      db().query('SELECT id FROM cultural_traits WHERE id = $1', [id]),
    ).resolves.toHaveLength(1);
  });

  it('allows multiple records of the same type in one village', async () => {
    await insertCulturalTrait({ type: 'CRAFT' });
    await insertCulturalTrait({ type: 'CRAFT' });

    const [{ count }] = await db().query<{ count: number }[]>(
      `SELECT count(*)::int AS count
       FROM cultural_traits WHERE village_id = $1 AND type = 'CRAFT'`,
      [fixtureIds.village],
    );
    expect(count).toBe(2);
  });

  it('has no TypeORM schema drift', async () => {
    const schema = await db().driver.createSchemaBuilder().log();

    expect(schema.upQueries).toEqual([]);
  });
});
