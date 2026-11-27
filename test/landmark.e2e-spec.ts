import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { CreateLandmarkDto } from '../src/modules/heritage/dto/create-landmark.dto';
import { LandmarkQueryDto } from '../src/modules/heritage/dto/landmark-query.dto';
import { UpdateLandmarkDto } from '../src/modules/heritage/dto/update-landmark.dto';
import { LandmarkType } from '../src/modules/heritage/entities/landmark.entity';
import {
  LandmarkReviewerContext,
  LandmarkService,
} from '../src/modules/heritage/landmark.service';
import { SourceService } from '../src/modules/source/source.service';
import { VerificationStatus } from '../src/modules/source/verification/verification-status.enum';
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

interface LandmarkRow {
  id: string;
  village_id: string;
  source_id: string;
  name: string;
  type: LandmarkType;
  description: string;
  status: VerificationStatus;
  reviewed_at: Date | null;
  reviewed_by_id: string | null;
  review_note: string | null;
}

interface InsertOptions {
  id?: string;
  villageId?: string;
  sourceId?: string;
  name?: string;
  type?: LandmarkType;
  status?: VerificationStatus;
  reviewedById?: string | null;
  reviewNote?: string | null;
}

describe('Landmark module (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let landmarkService: LandmarkService | undefined;
  let reviewerId: string | undefined;
  const landmarkIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The isolated test database is not initialized');
    }
    return dataSource;
  };

  const service = (): LandmarkService => {
    if (!landmarkService) {
      throw new Error('The Landmark service is not initialized');
    }
    return landmarkService;
  };

  const reviewer = (): LandmarkReviewerContext => {
    if (!reviewerId) {
      throw new Error('The Landmark test reviewer is not initialized');
    }
    return { reviewerId };
  };

  const landmarksPath = (villageId = fixtureIds.village) =>
    `/api/v1/villages/${villageId}/landmarks`;

  let viewer: TestCaller;
  let editor: TestCaller;
  let verifier: TestCaller;
  let admin: TestCaller;

  // Write endpoints need a token; ADMIN is allowed on all of them.
  const http = () => {
    if (!app) {
      throw new Error('The Landmark test application is not initialized');
    }
    return httpAs(app, admin);
  };

  const insertLandmark = async (
    options: InsertOptions = {},
  ): Promise<string> => {
    const id = options.id ?? randomUUID();
    await db().query(
      `INSERT INTO landmarks
         (id, village_id, source_id, name, type, description, status,
          reviewed_by_id, review_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        options.villageId ?? fixtureIds.village,
        options.sourceId ?? fixtureIds.sources[0],
        options.name ?? `E2E Landmark ${fixtureToken}`,
        options.type ?? LandmarkType.SPRING,
        'Test landmark description',
        options.status ?? VerificationStatus.PENDING,
        options.reviewedById ?? null,
        options.reviewNote ?? null,
      ],
    );
    landmarkIds.add(id);
    return id;
  };

  const readLandmark = async (id: string): Promise<LandmarkRow | undefined> => {
    const rows = await db().query<LandmarkRow[]>(
      `SELECT id, village_id, source_id, name, type, description, status,
              reviewed_at, reviewed_by_id, review_note
       FROM landmarks WHERE id = $1`,
      [id],
    );
    return rows[0];
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
    landmarkService = app.get(LandmarkService);

    await db().query(
      `INSERT INTO governorates (id, name_ar, name_en)
       VALUES ($1, $2, $3)`,
      [
        fixtureIds.governorate,
        `E2E-LANDMARK-${fixtureToken}`,
        `E2E Landmark ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4), ($5, $6, $7, $4)`,
      [
        fixtureIds.village,
        `E2E-LANDMARK-${fixtureToken}-one`,
        `E2E Landmark ${fixtureToken} One`,
        fixtureIds.governorate,
        fixtureIds.otherVillage,
        `E2E-LANDMARK-${fixtureToken}-two`,
        `E2E Landmark ${fixtureToken} Two`,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'BOOK'), ($3, $4, 'SURVEY')`,
      [
        fixtureIds.sources[0],
        `E2E Landmark Source One ${fixtureToken}`,
        fixtureIds.sources[1],
        `E2E Landmark Source Two ${fixtureToken}`,
      ],
    );
    const user = await app.get(UsersService).create({
      email: `landmark-reviewer-${fixtureToken}@example.test`,
      passwordHash: 'test-only-password-hash',
      displayName: `E2E Landmark Reviewer ${fixtureToken}`,
      role: Role.VERIFIER,
    });
    reviewerId = user.id;
  }, 30000);

  afterEach(async () => cleanupLandmarks());

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  it('creates, updates, and deletes through LandmarkService', async () => {
    const created = await service().create(
      fixtureIds.village,
      Object.assign(new CreateLandmarkDto(), {
        name: 'Spring near the village',
        type: LandmarkType.SPRING,
        description: 'A spring with historical importance',
        sourceId: fixtureIds.sources[0],
      }),
    );
    landmarkIds.add(created.id);
    expect(created).toMatchObject({
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      source: {
        id: fixtureIds.sources[0],
        title: `E2E Landmark Source One ${fixtureToken}`,
      },
    });

    const updated = await service().update(
      fixtureIds.village,
      created.id,
      Object.assign(new UpdateLandmarkDto(), {
        name: 'Updated village spring',
        sourceId: fixtureIds.sources[1],
      }),
    );
    expect(updated).toMatchObject({
      name: 'Updated village spring',
      sourceId: fixtureIds.sources[1],
      status: VerificationStatus.PENDING,
      source: {
        id: fixtureIds.sources[1],
        title: `E2E Landmark Source Two ${fixtureToken}`,
      },
    });

    await service().remove(fixtureIds.village, created.id);
    expect(await readLandmark(created.id)).toBeUndefined();
  });

  it('lists only VERIFIED landmarks with type filtering, ordering, and pagination', async () => {
    const first = await insertLandmark({
      name: 'Ayyub spring',
      status: VerificationStatus.VERIFIED,
    });
    const second = await insertLandmark({
      name: 'Olive press',
      type: LandmarkType.OLD_BUILDING,
      status: VerificationStatus.VERIFIED,
    });
    const third = await insertLandmark({
      name: 'Zion spring',
      status: VerificationStatus.VERIFIED,
    });
    const pending = await insertLandmark({
      name: 'Pending spring',
      status: VerificationStatus.PENDING,
    });
    const rejected = await insertLandmark({
      name: 'Rejected spring',
      status: VerificationStatus.REJECTED,
    });

    const all = await service().list(
      fixtureIds.village,
      new LandmarkQueryDto(),
    );
    expect(all.data.map(({ id }) => id)).toEqual([first, second, third]);
    expect(
      all.data.every(({ status }) => status === VerificationStatus.VERIFIED),
    ).toBe(true);
    expect(all.data[0].source).toMatchObject({
      id: fixtureIds.sources[0],
      title: `E2E Landmark Source One ${fixtureToken}`,
    });
    expect(all.data.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([pending, rejected]),
    );

    const filtered = await service().list(
      fixtureIds.village,
      Object.assign(new LandmarkQueryDto(), {
        type: LandmarkType.SPRING,
        page: 1,
        limit: 1,
      }),
    );
    expect(filtered.data.map(({ id }) => id)).toEqual([first]);
    expect(filtered.meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });

  it('enforces allowed and forbidden review transitions with reviewer metadata', async () => {
    const verifiedId = await insertLandmark();
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
    expect(await readLandmark(verifiedId)).toMatchObject({
      status: VerificationStatus.VERIFIED,
      reviewed_by_id: reviewerId,
      review_note: 'Evidence confirmed',
    });

    await expect(
      service().reject(fixtureIds.village, verifiedId, reviewer(), {
        reviewNote: 'Later evidence disproved it',
      }),
    ).resolves.toMatchObject({ status: VerificationStatus.REJECTED });
    await expect(
      service().verify(fixtureIds.village, verifiedId, reviewer(), {}),
    ).rejects.toBeInstanceOf(ConflictException);

    const rejectedId = await insertLandmark();
    await expect(
      service().reject(fixtureIds.village, rejectedId, reviewer(), {
        reviewNote: 'Insufficient evidence',
      }),
    ).resolves.toMatchObject({
      status: VerificationStatus.REJECTED,
      reviewedById: reviewerId,
      reviewNote: 'Insufficient evidence',
    });
    await expect(
      service().reject(fixtureIds.village, rejectedId, reviewer(), {
        reviewNote: 'Try again',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('protects VERIFIED landmarks from service updates and deletion', async () => {
    const id = await insertLandmark({
      status: VerificationStatus.VERIFIED,
      reviewedById: reviewerId,
    });

    await expect(
      service().update(
        fixtureIds.village,
        id,
        Object.assign(new UpdateLandmarkDto(), { name: 'Must not change' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service().remove(fixtureIds.village, id),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await readLandmark(id)).toMatchObject({
      status: VerificationStatus.VERIFIED,
      name: `E2E Landmark ${fixtureToken}`,
    });
  });

  it('rejects a racing update after verification changes the status', async () => {
    const id = await insertLandmark();
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
      Object.assign(new UpdateLandmarkDto(), {
        sourceId: fixtureIds.sources[1],
      }),
    );
    await ensureEntered;
    try {
      await service().verify(fixtureIds.village, id, reviewer(), {});
      releaseEnsure();
      await expect(updating).rejects.toBeInstanceOf(ConflictException);
      expect(await readLandmark(id)).toMatchObject({
        status: VerificationStatus.VERIFIED,
        source_id: fixtureIds.sources[0],
      });
    } finally {
      releaseEnsure();
      ensureSpy.mockRestore();
    }
  });

  it('serves a public VERIFIED-only HTTP list', async () => {
    const pendingId = await insertLandmark({
      name: 'Pending landmark',
      status: VerificationStatus.PENDING,
    });
    const rejectedId = await insertLandmark({
      name: 'Rejected landmark',
      status: VerificationStatus.REJECTED,
    });
    const verifiedId = await insertLandmark({
      name: 'Verified landmark',
      status: VerificationStatus.VERIFIED,
    });

    const response = await request(app!.getHttpServer())
      .get(landmarksPath())
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
      .get(`${landmarksPath()}?status=VERIFIED`)
      .expect(200);
    expect(
      explicitVerified.body.data.map((record: { id: string }) => record.id),
    ).toEqual([verifiedId]);

    for (const caller of [viewer, editor, verifier, admin]) {
      const roleResponse = await httpAs(app!, caller)
        .get(`${landmarksPath()}?status=VERIFIED`)
        .expect(200);
      expect(
        roleResponse.body.data.map((record: { id: string }) => record.id),
      ).toEqual([verifiedId]);
    }
  });

  it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
    'restricts %s landmark filters to EDITOR, VERIFIER, and ADMIN',
    async (status) => {
      if (!app) {
        throw new Error('The Landmark test application is not initialized');
      }
      const firstId = await insertLandmark({
        name: `A ${status} spring ${fixtureToken}`,
        type: LandmarkType.SPRING,
        status,
      });
      await insertLandmark({
        name: `B ${status} spring ${fixtureToken}`,
        type: LandmarkType.SPRING,
        status,
      });
      await insertLandmark({
        name: `C ${status} viewpoint ${fixtureToken}`,
        type: LandmarkType.VIEWPOINT,
        status,
      });
      const path = `${landmarksPath()}?status=${status}&type=${LandmarkType.SPRING}&page=1&limit=1`;

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
          type: LandmarkType.SPRING,
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

  it('creates PENDING records, updates them, and deletes them over HTTP', async () => {
    const created = await http()
      .post(landmarksPath())
      .send({
        name: 'HTTP-created landmark',
        type: LandmarkType.VIEWPOINT,
        description: 'A viewpoint created through the API',
        sourceId: fixtureIds.sources[0],
      })
      .expect(201);
    const id = created.body.id as string;
    landmarkIds.add(id);
    expect(created.body).toMatchObject({
      villageId: fixtureIds.village,
      name: 'HTTP-created landmark',
      type: LandmarkType.VIEWPOINT,
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      source: { id: fixtureIds.sources[0] },
    });

    await http()
      .patch(`${landmarksPath()}/${id}`)
      .send({ name: 'HTTP-updated landmark' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id,
          name: 'HTTP-updated landmark',
          status: VerificationStatus.PENDING,
        });
      });
    await http().delete(`${landmarksPath()}/${id}`).expect(204);
    expect(await readLandmark(id)).toBeUndefined();
    landmarkIds.delete(id);
  });

  it('rejects invalid HTTP input and reports unknown village, source, and landmark', async () => {
    await http()
      .post(landmarksPath())
      .send({
        name: ' ',
        type: LandmarkType.SPRING,
        description: 'Description',
        sourceId: fixtureIds.sources[0],
      })
      .expect(400);
    await http()
      .post('/api/v1/villages/not-a-uuid/landmarks')
      .send({
        name: 'Valid name',
        type: LandmarkType.SPRING,
        description: 'Description',
        sourceId: fixtureIds.sources[0],
      })
      .expect(400);
    await http().get(landmarksPath(randomUUID())).expect(404);
    await http()
      .post(landmarksPath())
      .send({
        name: 'Unknown source landmark',
        type: LandmarkType.SPRING,
        description: 'Description',
        sourceId: randomUUID(),
      })
      .expect(422);
    await http()
      .patch(`${landmarksPath()}/${randomUUID()}`)
      .send({ name: 'Unknown record' })
      .expect(404);
    await http().delete(`${landmarksPath()}/${randomUUID()}`).expect(404);
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
      const id = await insertLandmark();
      const before = await readLandmark(id);
      for (const action of ['verify', 'reject']) {
        await request(app!.getHttpServer())
          .post(`${landmarksPath()}/${id}/${action}`)
          .set('x-user-id', verifier.userId)
          .set('x-role', 'ADMIN')
          .send(reviewNote)
          .expect(401);
      }
      expect(await readLandmark(id)).toEqual(before);
    });

    it('returns 403 for VIEWER and EDITOR without changing the record', async () => {
      const id = await insertLandmark();
      const before = await readLandmark(id);
      for (const caller of [viewer, editor]) {
        for (const action of ['verify', 'reject']) {
          await httpAs(app!, caller)
            .post(`${landmarksPath()}/${id}/${action}`)
            .send(reviewNote)
            .expect(403);
        }
      }
      expect(await readLandmark(id)).toEqual(before);
    });

    it('rejects forged reviewer fields in the body', async () => {
      const id = await insertLandmark();
      const before = await readLandmark(id);
      await httpAs(app!, verifier)
        .post(`${landmarksPath()}/${id}/verify`)
        .send({
          ...reviewNote,
          reviewerId: viewer.userId,
          reviewedById: viewer.userId,
          status: VerificationStatus.VERIFIED,
        })
        .expect(400);
      expect(await readLandmark(id)).toEqual(before);
    });

    it('verifies as VERIFIER and records the caller as reviewer', async () => {
      const id = await insertLandmark();
      const res = await httpAs(app!, verifier)
        .post(`${landmarksPath()}/${id}/verify`)
        .send(reviewNote)
        .expect(200);
      expect(res.body).toMatchObject({
        status: VerificationStatus.VERIFIED,
        reviewedById: verifier.userId,
      });
      expect(await readLandmark(id)).toMatchObject({
        status: VerificationStatus.VERIFIED,
        reviewed_by_id: verifier.userId,
      });
    });

    it('rejects as ADMIN and records the caller as reviewer', async () => {
      const id = await insertLandmark();
      const res = await http()
        .post(`${landmarksPath()}/${id}/reject`)
        .send(reviewNote)
        .expect(200);
      expect(res.body).toMatchObject({
        status: VerificationStatus.REJECTED,
        reviewedById: admin.userId,
      });
      expect(await readLandmark(id)).toMatchObject({
        status: VerificationStatus.REJECTED,
        reviewed_by_id: admin.userId,
      });
    });
  });
});
