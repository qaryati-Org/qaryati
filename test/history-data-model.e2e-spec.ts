import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { HistoryRecord } from '../src/modules/history/entities/history-record.entity';
import { Role } from '../src/modules/auth/enums/role.enum';
import { UsersService } from '../src/modules/users/users.service';
import { VerificationStatus } from '../src/modules/source/verification/verification-status.enum';
import { createTestApp } from './utils/create-test-app';

const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  villages: [randomUUID(), randomUUID()] as const,
  sources: [randomUUID(), randomUUID()] as const,
};

interface InsertOptions {
  id?: string;
  villageId?: string;
  sourceId?: string;
  type?: 'OVERVIEW' | 'EVENT';
  status?: VerificationStatus;
  startYear?: number | null;
  endYear?: number | null;
  reviewedById?: string | null;
}

describe('history_records data model (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let reviewerId: string | undefined;
  const recordIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The isolated test database is not initialized');
    }
    return dataSource;
  };

  const trackRecord = async (options: InsertOptions = {}): Promise<string> => {
    const id = options.id ?? randomUUID();
    await db().query(
      `INSERT INTO history_records
         (id, village_id, source_id, type, title, description,
          start_year, end_year, status, reviewed_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        options.villageId ?? fixtureIds.villages[0],
        options.sourceId ?? fixtureIds.sources[0],
        options.type ?? 'EVENT',
        `E2E history ${fixtureToken}`,
        'Test history record',
        options.startYear ?? null,
        options.endYear ?? null,
        options.status ?? VerificationStatus.PENDING,
        options.reviewedById ?? null,
      ],
    );
    recordIds.add(id);
    return id;
  };

  const cleanupRecords = async (): Promise<void> => {
    const ids = [...recordIds];
    if (ids.length > 0) {
      await db().query(
        'DELETE FROM history_records WHERE id = ANY($1::uuid[])',
        [ids],
      );
      recordIds.clear();
    }
  };

  const cleanupFixtures = async (): Promise<void> => {
    if (!dataSource) return;
    await cleanupRecords();
    await db().query('DELETE FROM villages WHERE id = ANY($1::uuid[])', [
      [...fixtureIds.villages],
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
        `E2E-HISTORY-${fixtureToken}`,
        `E2E History ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4), ($5, $6, $7, $4)`,
      [
        fixtureIds.villages[0],
        `E2E-HISTORY-${fixtureToken}-one`,
        `E2E History ${fixtureToken} One`,
        fixtureIds.governorate,
        fixtureIds.villages[1],
        `E2E-HISTORY-${fixtureToken}-two`,
        `E2E History ${fixtureToken} Two`,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'BOOK'), ($3, $4, 'SURVEY')`,
      [
        fixtureIds.sources[0],
        `E2E History Book ${fixtureToken}`,
        fixtureIds.sources[1],
        `E2E History Survey ${fixtureToken}`,
      ],
    );
    const reviewer = await app.get(UsersService).create({
      email: `history-model-${fixtureToken}@example.test`,
      passwordHash: 'test-only-password-hash',
      displayName: `E2E History Reviewer ${fixtureToken}`,
      role: Role.VERIFIER,
    });
    reviewerId = reviewer.id;
  }, 30000);

  afterEach(async () => cleanupRecords());

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  it('runs the History migration and aligns entity columns with the database', async () => {
    const [{ exists }] = await db().query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM migrations
         WHERE name = 'CreateHistoryRecords1795623515961'
       ) AS exists`,
    );
    expect(exists).toBe(true);

    const entityColumns = db()
      .getMetadata(HistoryRecord)
      .columns.map((column) => column.databaseName)
      .sort();
    const actualColumns = (
      await db().query<{ column_name: string }[]>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'history_records'`,
      )
    )
      .map((column) => column.column_name)
      .sort();
    expect(actualColumns).toEqual(entityColumns);
  });

  it('creates required village, source, and reviewer foreign keys', async () => {
    const constraints = await db().query<{ conname: string }[]>(
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid = 'history_records'::regclass AND contype = 'f'`,
    );
    expect(constraints.map(({ conname }) => conname).sort()).toEqual(
      [
        'history_records_reviewed_by_id_fkey',
        'history_records_source_id_fkey',
        'history_records_village_id_fkey',
      ].sort(),
    );
  });

  it('accepts BCE years and a valid range crossing BCE to CE', async () => {
    await expect(
      trackRecord({ startYear: -500, endYear: 10 }),
    ).resolves.toBeTruthy();
  });

  it.each([
    [0, null, 'chk_history_records_start_year_not_zero'],
    [null, 0, 'chk_history_records_end_year_not_zero'],
    [2101, null, 'chk_history_records_start_year_max'],
    [null, 2101, 'chk_history_records_end_year_max'],
    [null, 1, 'chk_history_records_end_year_requires_start_year'],
    [10, 9, 'chk_history_records_year_order'],
  ])(
    'enforces year check constraint %s/%s',
    async (startYear, endYear, constraint) => {
      await expect(
        trackRecord({
          startYear: startYear,
          endYear: endYear,
        }),
      ).rejects.toMatchObject({ code: '23514', constraint });
    },
  );

  it('enforces village and source foreign keys on insertion', async () => {
    await expect(
      trackRecord({ villageId: randomUUID() }),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'history_records_village_id_fkey',
    });
    await expect(trackRecord({ sourceId: randomUUID() })).rejects.toMatchObject(
      {
        code: '23503',
        constraint: 'history_records_source_id_fkey',
      },
    );
  });

  it('enforces the reviewer foreign key and restricts parent deletion', async () => {
    const id = await trackRecord({ reviewedById: reviewerId });

    await expect(
      db().query('DELETE FROM villages WHERE id = $1', [
        fixtureIds.villages[0],
      ]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'history_records_village_id_fkey',
    });
    await expect(
      db().query('DELETE FROM sources WHERE id = $1', [fixtureIds.sources[0]]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'history_records_source_id_fkey',
    });
    await expect(
      db().query('DELETE FROM users WHERE id = $1', [reviewerId]),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'history_records_reviewed_by_id_fkey',
    });

    const [{ exists }] = await db().query<{ exists: boolean }[]>(
      'SELECT EXISTS (SELECT 1 FROM history_records WHERE id = $1) AS exists',
      [id],
    );
    expect(exists).toBe(true);
  });

  it('allows one OVERVIEW per village regardless of verification status', async () => {
    await trackRecord({ type: 'OVERVIEW', status: VerificationStatus.PENDING });

    for (const status of [
      VerificationStatus.VERIFIED,
      VerificationStatus.REJECTED,
    ]) {
      await expect(
        trackRecord({ type: 'OVERVIEW', status }),
      ).rejects.toMatchObject({
        code: '23505',
        constraint: 'uq_history_records_village_overview',
      });
    }
  });

  it('allows an OVERVIEW per other village and multiple EVENT records', async () => {
    await trackRecord({ type: 'OVERVIEW' });
    await trackRecord({
      type: 'OVERVIEW',
      villageId: fixtureIds.villages[1],
    });
    await trackRecord({ type: 'EVENT' });
    await trackRecord({ type: 'EVENT' });

    const [{ count }] = await db().query<{ count: number }[]>(
      `SELECT count(*)::int AS count
       FROM history_records
       WHERE village_id = ANY($1::uuid[])`,
      [[...fixtureIds.villages]],
    );
    expect(count).toBe(4);
  });
});
