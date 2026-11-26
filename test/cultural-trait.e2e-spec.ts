import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Role } from '../src/modules/auth/enums/role.enum';
import { CreateCulturalTraitDto } from '../src/modules/heritage/dto/create-cultural-trait.dto';
import { CulturalTraitQueryDto } from '../src/modules/heritage/dto/cultural-trait-query.dto';
import { UpdateCulturalTraitDto } from '../src/modules/heritage/dto/update-cultural-trait.dto';
import { CulturalTraitType } from '../src/modules/heritage/entities/cultural-trait.entity';
import {
  CulturalTraitReviewerContext,
  CulturalTraitService,
} from '../src/modules/heritage/cultural-trait.service';
import { SourceService } from '../src/modules/source/source.service';
import { VerificationStatus } from '../src/modules/source/verification/verification-status.enum';
import { UsersService } from '../src/modules/users/users.service';
import { createTestApp } from './utils/create-test-app';

const fixtureToken = randomUUID();
const fixtureIds = {
  governorate: randomUUID(),
  village: randomUUID(),
  otherVillage: randomUUID(),
  sources: [randomUUID(), randomUUID()] as const,
};

interface CulturalTraitRow {
  id: string;
  village_id: string;
  source_id: string;
  name: string;
  type: CulturalTraitType;
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
  type?: CulturalTraitType;
  status?: VerificationStatus;
  reviewedById?: string | null;
  reviewNote?: string | null;
}

describe('Cultural Trait module (e2e)', () => {
  let app: INestApplication<App> | undefined;
  let dataSource: DataSource | undefined;
  let culturalTraitService: CulturalTraitService | undefined;
  let reviewerId: string | undefined;
  const culturalTraitIds = new Set<string>();

  const db = (): DataSource => {
    if (!dataSource) {
      throw new Error('The isolated test database is not initialized');
    }
    return dataSource;
  };

  const service = (): CulturalTraitService => {
    if (!culturalTraitService) {
      throw new Error('The Cultural Trait service is not initialized');
    }
    return culturalTraitService;
  };

  const reviewer = (): CulturalTraitReviewerContext => {
    if (!reviewerId) {
      throw new Error('The Cultural Trait test reviewer is not initialized');
    }
    return { reviewerId };
  };

  const culturalTraitsPath = (villageId = fixtureIds.village) =>
    `/api/v1/villages/${villageId}/cultural-traits`;

  const http = () => {
    if (!app) {
      throw new Error('The Cultural Trait test application is not initialized');
    }
    return request(app.getHttpServer());
  };

  const insertCulturalTrait = async (
    options: InsertOptions = {},
  ): Promise<string> => {
    const id = options.id ?? randomUUID();
    await db().query(
      `INSERT INTO cultural_traits
         (id, village_id, source_id, type, name, description, status,
          reviewed_by_id, review_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        options.villageId ?? fixtureIds.village,
        options.sourceId ?? fixtureIds.sources[0],
        options.type ?? CulturalTraitType.CRAFT,
        options.name ?? `E2E Cultural Trait ${fixtureToken}`,
        'Test cultural trait description',
        options.status ?? VerificationStatus.PENDING,
        options.reviewedById ?? null,
        options.reviewNote ?? null,
      ],
    );
    culturalTraitIds.add(id);
    return id;
  };

  const readCulturalTrait = async (
    id: string,
  ): Promise<CulturalTraitRow | undefined> => {
    const rows = await db().query<CulturalTraitRow[]>(
      `SELECT id, village_id, source_id, type, name, description, status,
              reviewed_at, reviewed_by_id, review_note
       FROM cultural_traits WHERE id = $1`,
      [id],
    );
    return rows[0];
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
    dataSource = app.get(DataSource);
    culturalTraitService = app.get(CulturalTraitService);

    await db().query(
      `INSERT INTO governorates (id, name_ar, name_en)
       VALUES ($1, $2, $3)`,
      [
        fixtureIds.governorate,
        `E2E-CULTURAL-TRAIT-${fixtureToken}`,
        `E2E Cultural Trait ${fixtureToken}`,
      ],
    );
    await db().query(
      `INSERT INTO villages (id, name_ar, name_en, governorate_id)
       VALUES ($1, $2, $3, $4), ($5, $6, $7, $4)`,
      [
        fixtureIds.village,
        `E2E-CULTURAL-TRAIT-${fixtureToken}-one`,
        `E2E Cultural Trait ${fixtureToken} One`,
        fixtureIds.governorate,
        fixtureIds.otherVillage,
        `E2E-CULTURAL-TRAIT-${fixtureToken}-two`,
        `E2E Cultural Trait ${fixtureToken} Two`,
      ],
    );
    await db().query(
      `INSERT INTO sources (id, title, type)
       VALUES ($1, $2, 'BOOK'), ($3, $4, 'SURVEY')`,
      [
        fixtureIds.sources[0],
        `E2E Cultural Trait Source One ${fixtureToken}`,
        fixtureIds.sources[1],
        `E2E Cultural Trait Source Two ${fixtureToken}`,
      ],
    );
    const user = await app.get(UsersService).create({
      email: `cultural-trait-reviewer-${fixtureToken}@example.test`,
      passwordHash: 'test-only-password-hash',
      displayName: `E2E Cultural Trait Reviewer ${fixtureToken}`,
      role: Role.VERIFIER,
    });
    reviewerId = user.id;
  }, 30000);

  afterEach(async () => cleanupCulturalTraits());

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app?.close();
    }
  });

  it('creates, updates, and deletes through CulturalTraitService', async () => {
    const created = await service().create(
      fixtureIds.village,
      Object.assign(new CreateCulturalTraitDto(), {
        name: 'Traditional weaving',
        type: CulturalTraitType.CRAFT,
        description: 'A locally practiced weaving tradition',
        sourceId: fixtureIds.sources[0],
      }),
    );
    culturalTraitIds.add(created.id);
    expect(created).toMatchObject({
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      source: {
        id: fixtureIds.sources[0],
        title: `E2E Cultural Trait Source One ${fixtureToken}`,
      },
    });

    const updated = await service().update(
      fixtureIds.village,
      created.id,
      Object.assign(new UpdateCulturalTraitDto(), {
        name: 'Updated weaving',
        sourceId: fixtureIds.sources[1],
      }),
    );
    expect(updated).toMatchObject({
      name: 'Updated weaving',
      sourceId: fixtureIds.sources[1],
      status: VerificationStatus.PENDING,
      source: {
        id: fixtureIds.sources[1],
        title: `E2E Cultural Trait Source Two ${fixtureToken}`,
      },
    });

    await service().remove(fixtureIds.village, created.id);
    expect(await readCulturalTrait(created.id)).toBeUndefined();
    culturalTraitIds.delete(created.id);
  });

  it('lists VERIFIED records with database filtering, ordering, and pagination', async () => {
    const first = await insertCulturalTrait({
      name: 'A weaving practice',
      type: CulturalTraitType.CRAFT,
      status: VerificationStatus.VERIFIED,
    });
    const second = await insertCulturalTrait({
      name: 'Food preservation',
      type: CulturalTraitType.FOOD,
      status: VerificationStatus.VERIFIED,
    });
    const third = await insertCulturalTrait({
      name: 'Olive cultivation',
      type: CulturalTraitType.FARMING_PRACTICE,
      status: VerificationStatus.VERIFIED,
    });
    const tieA = await insertCulturalTrait({
      name: 'Shared name',
      status: VerificationStatus.VERIFIED,
    });
    const tieB = await insertCulturalTrait({
      name: 'Shared name',
      status: VerificationStatus.VERIFIED,
    });
    const pending = await insertCulturalTrait({
      name: 'Pending custom',
      status: VerificationStatus.PENDING,
    });
    const rejected = await insertCulturalTrait({
      name: 'Rejected custom',
      status: VerificationStatus.REJECTED,
    });

    const all = await service().list(
      fixtureIds.village,
      new CulturalTraitQueryDto(),
    );
    const expectedOrder = [first, second, third, tieA, tieB].sort((a, b) => {
      const byName = new Map([
        [first, 'A weaving practice'],
        [second, 'Food preservation'],
        [third, 'Olive cultivation'],
        [tieA, 'Shared name'],
        [tieB, 'Shared name'],
      ]);
      return byName.get(a)!.localeCompare(byName.get(b)!) || a.localeCompare(b);
    });
    expect(all.data.map(({ id }) => id)).toEqual(expectedOrder);
    expect(
      all.data.every(({ status }) => status === VerificationStatus.VERIFIED),
    ).toBe(true);
    expect(all.data[0].source).toMatchObject({
      id: fixtureIds.sources[0],
      title: `E2E Cultural Trait Source One ${fixtureToken}`,
    });
    expect(all.data.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining([pending, rejected]),
    );

    for (const [type, expectedId] of [
      [CulturalTraitType.CRAFT, first],
      [CulturalTraitType.FOOD, second],
      [CulturalTraitType.FARMING_PRACTICE, third],
    ] as const) {
      const filtered = await service().list(
        fixtureIds.village,
        Object.assign(new CulturalTraitQueryDto(), { type }),
      );
      expect(filtered.data.map(({ id }) => id)).toContain(expectedId);
      expect(filtered.data.every((trait) => trait.type === type)).toBe(true);
    }

    const page = await service().list(
      fixtureIds.village,
      Object.assign(new CulturalTraitQueryDto(), { page: 2, limit: 1 }),
    );
    expect(page.data.map(({ id }) => id)).toEqual([second]);
    expect(page.meta).toEqual({
      page: 2,
      limit: 1,
      total: 5,
      totalPages: 5,
    });
  });

  it('persists review transitions, trusted reviewer metadata, and terminal rejection', async () => {
    const verifiedId = await insertCulturalTrait();
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
    expect(await readCulturalTrait(verifiedId)).toMatchObject({
      status: VerificationStatus.VERIFIED,
      reviewed_by_id: reviewerId,
      review_note: 'Evidence confirmed',
    });

    await expect(
      service().reject(fixtureIds.village, verifiedId, reviewer(), {
        reviewNote: 'Later evidence disproved it',
      }),
    ).resolves.toMatchObject({
      status: VerificationStatus.REJECTED,
      reviewedById: reviewerId,
    });
    await expect(
      service().verify(fixtureIds.village, verifiedId, reviewer(), {}),
    ).rejects.toBeInstanceOf(ConflictException);

    const rejectedId = await insertCulturalTrait();
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

  it('prevents updates and deletion of VERIFIED records', async () => {
    const id = await insertCulturalTrait({
      status: VerificationStatus.VERIFIED,
      reviewedById: reviewerId,
    });

    await expect(
      service().update(
        fixtureIds.village,
        id,
        Object.assign(new UpdateCulturalTraitDto(), {
          name: 'Must not change',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service().remove(fixtureIds.village, id),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await readCulturalTrait(id)).toMatchObject({
      status: VerificationStatus.VERIFIED,
      name: `E2E Cultural Trait ${fixtureToken}`,
    });
  });

  it('rejects a racing update after review changes the status', async () => {
    const id = await insertCulturalTrait();
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
      Object.assign(new UpdateCulturalTraitDto(), {
        sourceId: fixtureIds.sources[1],
      }),
    );
    await ensureEntered;
    try {
      await service().verify(fixtureIds.village, id, reviewer(), {});
      releaseEnsure();
      await expect(updating).rejects.toBeInstanceOf(ConflictException);
      expect(await readCulturalTrait(id)).toMatchObject({
        status: VerificationStatus.VERIFIED,
        source_id: fixtureIds.sources[0],
      });
    } finally {
      releaseEnsure();
      ensureSpy.mockRestore();
    }
  });

  it('serves a public VERIFIED-only HTTP list with source provenance', async () => {
    const pendingId = await insertCulturalTrait({
      name: 'Pending trait',
      status: VerificationStatus.PENDING,
    });
    const rejectedId = await insertCulturalTrait({
      name: 'Rejected trait',
      status: VerificationStatus.REJECTED,
    });
    const verifiedId = await insertCulturalTrait({
      name: 'Verified trait',
      status: VerificationStatus.VERIFIED,
    });

    const response = await http().get(culturalTraitsPath()).expect(200);
    expect(response.body.data.map((trait: { id: string }) => trait.id)).toEqual(
      [verifiedId],
    );
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
      response.body.data.map((trait: { id: string }) => trait.id),
    ).not.toEqual(expect.arrayContaining([pendingId, rejectedId]));
  });

  it('creates, updates, and deletes Cultural Traits over HTTP', async () => {
    const created = await http()
      .post(culturalTraitsPath())
      .send({
        name: 'HTTP-created trait',
        type: CulturalTraitType.FOOD,
        description: 'A food tradition created through the API',
        sourceId: fixtureIds.sources[0],
      })
      .expect(201);
    const id = created.body.id as string;
    culturalTraitIds.add(id);
    expect(created.body).toMatchObject({
      villageId: fixtureIds.village,
      name: 'HTTP-created trait',
      type: CulturalTraitType.FOOD,
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      source: { id: fixtureIds.sources[0] },
    });

    await http()
      .patch(`${culturalTraitsPath()}/${id}`)
      .send({ name: 'HTTP-updated trait' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id,
          name: 'HTTP-updated trait',
          status: VerificationStatus.PENDING,
        });
      });
    await http().delete(`${culturalTraitsPath()}/${id}`).expect(204);
    expect(await readCulturalTrait(id)).toBeUndefined();
    culturalTraitIds.delete(id);
  });

  it('validates HTTP input and reports missing village, source, and record', async () => {
    await http()
      .post(culturalTraitsPath())
      .send({
        name: ' ',
        type: CulturalTraitType.CRAFT,
        description: 'Description',
        sourceId: fixtureIds.sources[0],
      })
      .expect(400);
    await http()
      .post(culturalTraitsPath())
      .send({
        name: 'Valid name',
        type: 'UNKNOWN',
        description: 'Description',
        sourceId: fixtureIds.sources[0],
      })
      .expect(400);
    await http()
      .post('/api/v1/villages/not-a-uuid/cultural-traits')
      .send({
        name: 'Valid name',
        type: CulturalTraitType.CRAFT,
        description: 'Description',
        sourceId: fixtureIds.sources[0],
      })
      .expect(400);
    await http().get(culturalTraitsPath(randomUUID())).expect(404);
    await http()
      .post(culturalTraitsPath())
      .send({
        name: 'Unknown source trait',
        type: CulturalTraitType.CRAFT,
        description: 'Description',
        sourceId: randomUUID(),
      })
      .expect(422);
    await http()
      .patch(`${culturalTraitsPath()}/${randomUUID()}`)
      .send({ name: 'Unknown record' })
      .expect(404);
    await http().delete(`${culturalTraitsPath()}/${randomUUID()}`).expect(404);
  });

  it('blocks forged HTTP review requests without changing records', async () => {
    const id = await insertCulturalTrait();
    const before = await readCulturalTrait(id);

    await http()
      .post(`${culturalTraitsPath()}/${id}/verify`)
      .set('x-user-id', reviewerId!)
      .set('x-role', 'ADMIN')
      .send({
        reviewerId,
        reviewedById: reviewerId,
        reviewedAt: new Date().toISOString(),
        status: VerificationStatus.VERIFIED,
        role: 'ADMIN',
      })
      .expect(401);
    await http()
      .post(`${culturalTraitsPath()}/${id}/reject`)
      .set('x-user-id', reviewerId!)
      .set('x-role', 'ADMIN')
      .send({
        reviewerId,
        reviewedById: reviewerId,
        reviewedAt: new Date().toISOString(),
        status: VerificationStatus.REJECTED,
        role: 'ADMIN',
        reviewNote: 'Forged review',
      })
      .expect(401);

    expect(await readCulturalTrait(id)).toEqual(before);
  });
});
