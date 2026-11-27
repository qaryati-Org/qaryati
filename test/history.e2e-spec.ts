import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { CreateHistoryRecordDto } from '../src/modules/history/dto/create-history-record.dto';
import { HistoryRecordQueryDto } from '../src/modules/history/dto/history-record-query.dto';
import { UpdateHistoryRecordDto } from '../src/modules/history/dto/update-history-record.dto';
import {
  HistoryRecord,
  HistoryRecordType,
} from '../src/modules/history/entities/history-record.entity';
import {
  HistoryReviewerContext,
  HistoryService,
} from '../src/modules/history/history.service';
import { VerificationStatus } from '../src/modules/source/verification/verification-status.enum';
import { SourceService } from '../src/modules/source/source.service';
import { UsersService } from '../src/modules/users/users.service';
import { callerWithRole, httpAs, TestCaller } from './utils/auth';
import { createTestApp } from './utils/create-test-app';

const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  village: randomUUID(),
  otherVillage: randomUUID(),
  sources: [randomUUID(), randomUUID()] as const,
};

interface HistoryRow {
  id: string;
  village_id: string;
  source_id: string;
  type: HistoryRecordType;
  title: string;
  description: string;
  start_year: number | null;
  end_year: number | null;
  status: VerificationStatus;
  reviewed_at: Date | null;
  reviewed_by_id: string | null;
  review_note: string | null;
}

interface InsertOptions {
  id?: string;
  villageId?: string;
  sourceId?: string;
  type?: HistoryRecordType;
  startYear?: number | null;
  endYear?: number | null;
  status?: VerificationStatus;
  reviewedById?: string | null;
}

describe('History module (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let historyService: HistoryService | undefined;
  let reviewerId: string | undefined;
  const recordIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The isolated test database is not initialized');
    }
    return dataSource;
  };

  const service = (): HistoryService => {
    if (!historyService) {
      throw new Error('The History service is not initialized');
    }
    return historyService;
  };

  const reviewer = (): HistoryReviewerContext => {
    if (!reviewerId) {
      throw new Error('The History test reviewer is not initialized');
    }
    return { reviewerId };
  };

  const historyPath = (villageId = fixtureIds.village) =>
    `/api/v1/villages/${villageId}/history`;

  let viewer: TestCaller;
  let editor: TestCaller;
  let verifier: TestCaller;
  let admin: TestCaller;

  // Write endpoints need a token; ADMIN is allowed on all of them.
  const http = () => {
    if (!app) {
      throw new Error('The History test application is not initialized');
    }
    return httpAs(app, admin);
  };

  const insertRecord = async (options: InsertOptions = {}): Promise<string> => {
    const id = options.id ?? randomUUID();
    await db().query(
      `INSERT INTO history_records
         (id, village_id, source_id, type, title, description,
          start_year, end_year, status, reviewed_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        options.villageId ?? fixtureIds.village,
        options.sourceId ?? fixtureIds.sources[0],
        options.type ?? HistoryRecordType.EVENT,
        `E2E History ${fixtureToken}`,
        'Test history description',
        options.startYear ?? null,
        options.endYear ?? null,
        options.status ?? VerificationStatus.PENDING,
        options.reviewedById ?? null,
      ],
    );
    recordIds.add(id);
    return id;
  };

  const readRecord = async (id: string): Promise<HistoryRow | undefined> => {
    const rows = await db().query<HistoryRow[]>(
      `SELECT id, village_id, source_id, type, title, description,
              start_year, end_year, status, reviewed_at, reviewed_by_id,
              review_note
       FROM history_records WHERE id = $1`,
      [id],
    );
    return rows[0];
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
      [fixtureIds.village, fixtureIds.otherVillage],
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
    viewer = await callerWithRole(app, Role.VIEWER);
    editor = await callerWithRole(app, Role.EDITOR);
    verifier = await callerWithRole(app, Role.VERIFIER);
    admin = await callerWithRole(app, Role.ADMIN);
    dataSource = app.get(DataSource);
    historyService = app.get(HistoryService);

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
        fixtureIds.village,
        `E2E-HISTORY-${fixtureToken}-one`,
        `E2E History ${fixtureToken} One`,
        fixtureIds.governorate,
        fixtureIds.otherVillage,
        `E2E-HISTORY-${fixtureToken}-two`,
        `E2E History ${fixtureToken} Two`,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'BOOK'), ($3, $4, 'SURVEY')`,
      [
        fixtureIds.sources[0],
        `E2E History Source One ${fixtureToken}`,
        fixtureIds.sources[1],
        `E2E History Source Two ${fixtureToken}`,
      ],
    );
    const user = await app.get(UsersService).create({
      email: `history-reviewer-${fixtureToken}@example.test`,
      passwordHash: 'test-only-password-hash',
      displayName: `E2E History Reviewer ${fixtureToken}`,
      role: Role.VERIFIER,
    });
    reviewerId = user.id;
  }, 30000);

  afterEach(async () => cleanupRecords());

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  it('creates, updates, and deletes records through HistoryService', async () => {
    const created = await service().create(
      fixtureIds.village,
      Object.assign(new CreateHistoryRecordDto(), {
        type: HistoryRecordType.EVENT,
        title: 'Created from the service',
        description: 'Initial data',
        sourceId: fixtureIds.sources[0],
        startYear: -50,
        endYear: 10,
      }),
    );
    recordIds.add(created.id);
    expect(created).toMatchObject({
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      startYear: -50,
      endYear: 10,
      source: { id: fixtureIds.sources[0] },
    });

    const updated = await service().update(
      fixtureIds.village,
      created.id,
      Object.assign(new UpdateHistoryRecordDto(), {
        title: 'Updated from the service',
        startYear: null,
        endYear: null,
      }),
    );
    expect(updated).toMatchObject({
      title: 'Updated from the service',
      startYear: null,
      endYear: null,
      status: VerificationStatus.PENDING,
    });

    await service().remove(fixtureIds.village, created.id);
    expect(await readRecord(created.id)).toBeUndefined();
  });

  it('returns 404 for a record accessed through the wrong village', async () => {
    const id = await insertRecord();

    await expect(
      service().update(
        fixtureIds.otherVillage,
        id,
        Object.assign(new UpdateHistoryRecordDto(), { title: 'Not allowed' }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service().remove(fixtureIds.otherVillage, id),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('verifies and rejects records with trusted reviewer metadata', async () => {
    const verifiedId = await insertRecord();
    const verified = await service().verify(
      fixtureIds.village,
      verifiedId,
      reviewer(),
      { reviewNote: 'Evidence confirmed' },
    );
    expect(verified).toMatchObject({
      status: VerificationStatus.VERIFIED,
      reviewedById: reviewerId,
      reviewNote: 'Evidence confirmed',
      source: { id: fixtureIds.sources[0] },
    });
    expect(verified.reviewedAt).toBeInstanceOf(Date);
    expect(await readRecord(verifiedId)).toMatchObject({
      status: VerificationStatus.VERIFIED,
      reviewed_by_id: reviewerId,
      review_note: 'Evidence confirmed',
    });

    const rejectedId = await insertRecord();
    const rejected = await service().reject(
      fixtureIds.village,
      rejectedId,
      reviewer(),
      { reviewNote: 'Insufficient evidence' },
    );
    expect(rejected).toMatchObject({
      status: VerificationStatus.REJECTED,
      reviewedById: reviewerId,
      reviewNote: 'Insufficient evidence',
    });
  });

  it('allows VERIFIED to REJECTED and rejects terminal or invalid transitions', async () => {
    const id = await insertRecord({
      status: VerificationStatus.VERIFIED,
      reviewedById: reviewerId,
    });
    await expect(
      service().reject(fixtureIds.village, id, reviewer(), {
        reviewNote: 'Later evidence disproved it',
      }),
    ).resolves.toMatchObject({ status: VerificationStatus.REJECTED });
    await expect(
      service().verify(fixtureIds.village, id, reviewer(), {}),
    ).rejects.toBeInstanceOf(ConflictException);

    const rejectedId = await insertRecord({
      status: VerificationStatus.REJECTED,
      reviewedById: reviewerId,
    });
    await expect(
      service().reject(fixtureIds.village, rejectedId, reviewer(), {
        reviewNote: 'Try again',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists only VERIFIED records chronologically with bulk source provenance', async () => {
    const nullYearId = randomUUID();
    const tiedYearIds = [randomUUID(), randomUUID()].sort();
    const latestYearId = randomUUID();
    await insertRecord({
      id: nullYearId,
      status: VerificationStatus.VERIFIED,
      startYear: null,
    });
    await insertRecord({
      id: tiedYearIds[0],
      status: VerificationStatus.VERIFIED,
      startYear: -20,
      sourceId: fixtureIds.sources[1],
    });
    await insertRecord({
      id: tiedYearIds[1],
      status: VerificationStatus.VERIFIED,
      startYear: -20,
    });
    await insertRecord({
      id: latestYearId,
      status: VerificationStatus.VERIFIED,
      startYear: 1948,
    });
    const pendingId = await insertRecord({
      status: VerificationStatus.PENDING,
      startYear: -100,
    });
    const rejectedId = await insertRecord({
      status: VerificationStatus.REJECTED,
      startYear: -200,
    });

    const result = await service().list(
      fixtureIds.village,
      new HistoryRecordQueryDto(),
    );

    expect(result.data.map((record) => record.id)).toEqual([
      nullYearId,
      ...tiedYearIds,
      latestYearId,
    ]);
    expect(
      result.data.every(
        (record) => record.status === VerificationStatus.VERIFIED,
      ),
    ).toBe(true);
    expect(result.data[1].source).toMatchObject({
      id: fixtureIds.sources[1],
      title: `E2E History Source Two ${fixtureToken}`,
    });
    expect(result.data.map((record) => record.id)).not.toContain(pendingId);
    expect(result.data.map((record) => record.id)).not.toContain(rejectedId);

    const eventResult = await service().list(
      fixtureIds.village,
      Object.assign(new HistoryRecordQueryDto(), {
        type: HistoryRecordType.EVENT,
        page: 1,
        limit: 2,
      }),
    );
    expect(eventResult.data).toHaveLength(2);
    expect(eventResult.meta).toMatchObject({
      total: 4,
      page: 1,
      limit: 2,
      totalPages: 2,
    });
  });

  it('returns 409 for verified update, delete, and duplicate overview writes', async () => {
    const verifiedId = await insertRecord({
      status: VerificationStatus.VERIFIED,
      reviewedById: reviewerId,
    });
    await expect(
      service().update(
        fixtureIds.village,
        verifiedId,
        Object.assign(new UpdateHistoryRecordDto(), { title: 'Changed' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service().remove(fixtureIds.village, verifiedId),
    ).rejects.toBeInstanceOf(ConflictException);

    await service()
      .create(
        fixtureIds.village,
        Object.assign(new CreateHistoryRecordDto(), {
          type: HistoryRecordType.OVERVIEW,
          title: 'Overview',
          description: 'Village overview',
          sourceId: fixtureIds.sources[0],
        }),
      )
      .then((created) => recordIds.add(created.id));
    await expect(
      service().create(
        fixtureIds.village,
        Object.assign(new CreateHistoryRecordDto(), {
          type: HistoryRecordType.OVERVIEW,
          title: 'Duplicate overview',
          description: 'Must conflict',
          sourceId: fixtureIds.sources[0],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows one only of concurrent verification and update after a status race', async () => {
    const id = await insertRecord();
    const sourceService = app!.get(SourceService);
    const originalEnsureExists = sourceService.ensureExists.bind(sourceService);
    let enterEnsure!: () => void;
    let releaseEnsure!: () => void;
    const ensureEntered = new Promise<void>((resolve) => {
      enterEnsure = resolve;
    });
    const ensureGate = new Promise<void>((resolve) => {
      releaseEnsure = resolve;
    });
    const ensureSpy = jest
      .spyOn(sourceService, 'ensureExists')
      .mockImplementation(async (sourceId) => {
        if (sourceId === fixtureIds.sources[1]) {
          enterEnsure();
          await ensureGate;
        }
        return originalEnsureExists(sourceId);
      });

    const updating = service().update(
      fixtureIds.village,
      id,
      Object.assign(new UpdateHistoryRecordDto(), {
        sourceId: fixtureIds.sources[1],
      }),
    );
    await ensureEntered;
    try {
      await service().verify(fixtureIds.village, id, reviewer(), {});
      releaseEnsure();
      await expect(updating).rejects.toBeInstanceOf(ConflictException);
      expect(await readRecord(id)).toMatchObject({
        status: VerificationStatus.VERIFIED,
        source_id: fixtureIds.sources[0],
      });
    } finally {
      releaseEnsure();
      ensureSpy.mockRestore();
    }
  });

  it('allows only one of concurrent verification and deletion after a status race', async () => {
    const id = await insertRecord();
    const repository = app!.get<Repository<HistoryRecord>>(
      getRepositoryToken(HistoryRecord),
    );
    const originalDelete = repository.delete.bind(repository);
    let enterDelete!: () => void;
    let releaseDelete!: () => void;
    const deleteEntered = new Promise<void>((resolve) => {
      enterDelete = resolve;
    });
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const deleteSpy = jest
      .spyOn(repository, 'delete')
      .mockImplementation(async (criteria) => {
        enterDelete();
        await deleteGate;
        return originalDelete(criteria);
      });

    const deleting = service().remove(fixtureIds.village, id);
    await deleteEntered;
    try {
      await service().verify(fixtureIds.village, id, reviewer(), {});
      releaseDelete();
      await expect(deleting).rejects.toBeInstanceOf(ConflictException);
      expect(await readRecord(id)).toMatchObject({
        status: VerificationStatus.VERIFIED,
      });
    } finally {
      releaseDelete();
      deleteSpy.mockRestore();
    }
  });

  it('serves a public verified-only timeline and rejects invalid listing input', async () => {
    const pendingId = await insertRecord({ startYear: -100 });
    const rejectedId = await insertRecord({
      status: VerificationStatus.REJECTED,
      startYear: -50,
    });
    const verifiedId = await insertRecord({
      status: VerificationStatus.VERIFIED,
      startYear: 1948,
    });

    const response = await request(app!.getHttpServer())
      .get(historyPath())
      .expect(200);
    expect(
      response.body.data.map((record: { id: string }) => record.id),
    ).toEqual([verifiedId]);
    expect(response.body.data[0]).toMatchObject({
      status: VerificationStatus.VERIFIED,
      source: { id: fixtureIds.sources[0] },
    });
    expect(response.body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(
      response.body.data.map((record: { id: string }) => record.id),
    ).not.toEqual(expect.arrayContaining([pendingId, rejectedId]));

    const explicitVerified = await request(app!.getHttpServer())
      .get(`${historyPath()}?status=VERIFIED`)
      .expect(200);
    expect(
      explicitVerified.body.data.map((record: { id: string }) => record.id),
    ).toEqual([verifiedId]);

    await http().get(`/api/v1/villages/not-a-uuid/history`).expect(400);
    await http().get(`${historyPath()}?type=UNSUPPORTED`).expect(400);
    await http().get(`${historyPath()}?status=UNKNOWN`).expect(400);

    for (const caller of [viewer, editor, verifier, admin]) {
      const roleResponse = await httpAs(app!, caller)
        .get(`${historyPath()}?status=VERIFIED`)
        .expect(200);
      expect(
        roleResponse.body.data.map((record: { id: string }) => record.id),
      ).toEqual([verifiedId]);
    }
  });

  it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
    'restricts %s history filters to EDITOR, VERIFIER, and ADMIN',
    async (status) => {
      if (!app) {
        throw new Error('The History test application is not initialized');
      }
      const firstId = await insertRecord({
        status,
        type: HistoryRecordType.EVENT,
        startYear: 1948,
      });
      await insertRecord({
        status,
        type: HistoryRecordType.EVENT,
        startYear: 1949,
      });
      await insertRecord({
        status,
        type: HistoryRecordType.OVERVIEW,
        startYear: null,
      });
      const path = `${historyPath()}?status=${status}&type=${HistoryRecordType.EVENT}&page=1&limit=1`;

      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('x-role', Role.ADMIN)
        .expect(401);
      await httpAs(app, viewer).get(path).set('x-role', Role.ADMIN).expect(403);

      for (const caller of [editor, verifier, admin]) {
        const response = await httpAs(app, caller).get(path).expect(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
          id: firstId,
          status,
          type: HistoryRecordType.EVENT,
        });
        expect(response.body.meta).toMatchObject({
          page: 1,
          limit: 1,
          total: 2,
          totalPages: 2,
        });
      }
    },
  );

  it('creates, updates, and deletes through the current permissive CRUD routes', async () => {
    const created = await http()
      .post(historyPath())
      .send({
        type: HistoryRecordType.EVENT,
        title: 'HTTP-created history',
        description: 'Created through the public CRUD route',
        sourceId: fixtureIds.sources[0],
        startYear: 2000,
      })
      .expect(201);
    const id = created.body.id as string;
    recordIds.add(id);

    expect(created.body).toMatchObject({
      villageId: fixtureIds.village,
      sourceId: fixtureIds.sources[0],
      type: HistoryRecordType.EVENT,
      title: 'HTTP-created history',
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      source: { id: fixtureIds.sources[0] },
    });

    const updated = await http()
      .patch(`${historyPath()}/${id}`)
      .send({ title: 'HTTP-updated history' })
      .expect(200);
    expect(updated.body).toMatchObject({
      id,
      title: 'HTTP-updated history',
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
    });

    await http().delete(`${historyPath()}/${id}`).expect(204);
    expect(await readRecord(id)).toBeUndefined();
    recordIds.delete(id);
  });

  it('protects VERIFIED records from HTTP update and delete', async () => {
    const id = await insertRecord({
      status: VerificationStatus.VERIFIED,
      reviewedById: reviewerId,
    });
    const before = await readRecord(id);

    await http()
      .patch(`${historyPath()}/${id}`)
      .send({ title: 'Must not update verified history' })
      .expect(409);
    await http().delete(`${historyPath()}/${id}`).expect(409);

    expect(await readRecord(id)).toEqual(before);
  });

  it('rejects invalid HTTP CRUD bodies and UUIDs', async () => {
    const id = await insertRecord();
    const before = await readRecord(id);
    const beforeCount = await db().query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM history_records WHERE village_id = $1',
      [fixtureIds.village],
    );

    await http()
      .post(historyPath())
      .send({ type: 'INVALID', reviewerId })
      .expect(400);
    await http()
      .post('/api/v1/villages/not-a-uuid/history')
      .send({
        type: HistoryRecordType.EVENT,
        title: 'Invalid path',
        description: 'Must not be created',
        sourceId: fixtureIds.sources[0],
      })
      .expect(400);
    await http()
      .patch(`${historyPath()}/${id}`)
      .send({ title: ' ' })
      .expect(400);
    await http()
      .patch(`${historyPath()}/not-a-uuid`)
      .send({ title: 'Valid' })
      .expect(400);
    await http().delete(`${historyPath()}/not-a-uuid`).expect(400);

    const [{ count: afterCount }] = await db().query<{ count: number }[]>(
      'SELECT count(*)::int AS count FROM history_records WHERE village_id = $1',
      [fixtureIds.village],
    );
    expect(afterCount).toBe(beforeCount[0].count);
    expect(await readRecord(id)).toEqual(before);
  });

  describe('HTTP review endpoints', () => {
    const reviewNote = { reviewNote: 'Checked against the source' };
    let verifier: TestCaller;
    let viewer: TestCaller;
    let editor: TestCaller;

    beforeAll(async () => {
      verifier = await callerWithRole(app!, Role.VERIFIER);
      viewer = await callerWithRole(app!, Role.VIEWER);
      editor = await callerWithRole(app!, Role.EDITOR);
    });

    it('returns 401 without a token, ignoring forged identity headers', async () => {
      const id = await insertRecord();
      const before = await readRecord(id);
      for (const action of ['verify', 'reject']) {
        await request(app!.getHttpServer())
          .post(`${historyPath()}/${id}/${action}`)
          .set('x-user-id', verifier.userId)
          .set('x-role', 'ADMIN')
          .send(reviewNote)
          .expect(401);
      }
      expect(await readRecord(id)).toEqual(before);
    });

    it('returns 403 for VIEWER and EDITOR without changing the record', async () => {
      const id = await insertRecord();
      const before = await readRecord(id);
      for (const caller of [viewer, editor]) {
        for (const action of ['verify', 'reject']) {
          await httpAs(app!, caller)
            .post(`${historyPath()}/${id}/${action}`)
            .send(reviewNote)
            .expect(403);
        }
      }
      expect(await readRecord(id)).toEqual(before);
    });

    it('rejects forged reviewer fields in the body', async () => {
      const id = await insertRecord();
      const before = await readRecord(id);
      await httpAs(app!, verifier)
        .post(`${historyPath()}/${id}/verify`)
        .send({
          ...reviewNote,
          reviewerId: viewer.userId,
          reviewedById: viewer.userId,
          status: VerificationStatus.VERIFIED,
        })
        .expect(400);
      expect(await readRecord(id)).toEqual(before);
    });

    it('verifies as VERIFIER and records the caller as reviewer', async () => {
      const id = await insertRecord();
      const res = await httpAs(app!, verifier)
        .post(`${historyPath()}/${id}/verify`)
        .send(reviewNote)
        .expect(200);
      expect(res.body).toMatchObject({
        status: VerificationStatus.VERIFIED,
        reviewedById: verifier.userId,
      });
      expect(await readRecord(id)).toMatchObject({
        status: VerificationStatus.VERIFIED,
        reviewed_by_id: verifier.userId,
      });
    });

    it('rejects as ADMIN and records the caller as reviewer', async () => {
      const id = await insertRecord();
      const res = await http()
        .post(`${historyPath()}/${id}/reject`)
        .send(reviewNote)
        .expect(200);
      expect(res.body).toMatchObject({
        status: VerificationStatus.REJECTED,
        reviewedById: admin.userId,
      });
      expect(await readRecord(id)).toMatchObject({
        status: VerificationStatus.REJECTED,
        reviewed_by_id: admin.userId,
      });
    });
  });
});
