import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  AUTH_TESTING_IMPORTS,
  AUTH_TESTING_PROVIDERS,
  bearerFor,
  TEST_CALLER_ID,
} from '../../../test/utils/unit-auth';
import { Role } from '../auth/enums/role.enum';
import { setupApp } from '../../setup-app';
import { CulturalTraitType } from './entities/cultural-trait.entity';
import { CulturalTraitController } from './cultural-trait.controller';
import { CulturalTraitService } from './cultural-trait.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const TRAIT_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const BASE_PATH = `/api/v1/villages/${VILLAGE_ID}/cultural-traits`;

describe('CulturalTraitController with role enforcement', () => {
  let app: INestApplication<App>;
  let culturalTraitService: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    verify: jest.Mock;
    reject: jest.Mock;
  };

  beforeEach(async () => {
    const responseDto = {
      id: TRAIT_ID,
      villageId: VILLAGE_ID,
      sourceId: SOURCE_ID,
      name: 'Traditional weaving',
      type: CulturalTraitType.CRAFT,
      description: 'A locally practiced weaving tradition',
      status: 'PENDING',
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      source: {
        id: SOURCE_ID,
        title: 'Source',
        type: 'BOOK',
        author: null,
        url: null,
        year: null,
      },
    };
    culturalTraitService = {
      list: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
      create: jest.fn().mockResolvedValue(responseDto),
      update: jest.fn().mockResolvedValue(responseDto),
      remove: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn(),
      reject: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [...AUTH_TESTING_IMPORTS],
      controllers: [CulturalTraitController],
      providers: [
        { provide: CulturalTraitService, useValue: culturalTraitService },
        ...AUTH_TESTING_PROVIDERS,
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(Object.values(CulturalTraitType))(
    'allows public GET and delegates the %s type filter and pagination',
    async (type) => {
      await request(app.getHttpServer())
        .get(`${BASE_PATH}?type=${type}&page=2&limit=5`)
        .expect(200);

      expect(culturalTraitService.list).toHaveBeenCalledWith(
        VILLAGE_ID,
        expect.objectContaining({ type, page: 2, limit: 5 }),
      );
    },
  );

  it('allows create, update, and delete with the expected HTTP status codes', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Traditional weaving',
        type: 'CRAFT',
        description: 'A locally practiced weaving tradition',
        sourceId: SOURCE_ID,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/${TRAIT_ID}`)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({ name: 'Updated weaving' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/${TRAIT_ID}`)
      .set('Authorization', bearerFor(Role.ADMIN))
      .expect(204);

    expect(culturalTraitService.create).toHaveBeenCalledTimes(1);
    expect(culturalTraitService.update).toHaveBeenCalledTimes(1);
    expect(culturalTraitService.remove).toHaveBeenCalledWith(
      VILLAGE_ID,
      TRAIT_ID,
    );
  });

  it('rejects invalid trait types, blank input, null updates, extra fields, and UUIDs', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Traditional food',
        type: 'UNKNOWN',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: '  ',
        type: 'FOOD',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Valid name',
        type: 'FOOD',
        description: '   ',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/${TRAIT_ID}`)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Valid name',
        type: 'FOOD',
        description: 'Description',
        sourceId: SOURCE_ID,
        status: 'VERIFIED',
        reviewedById: TRAIT_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/villages/not-a-uuid/cultural-traits')
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Valid name',
        type: 'FOOD',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/not-a-uuid`)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({ name: 'Updated name' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/not-a-uuid`)
      .set('Authorization', bearerFor(Role.ADMIN))
      .expect(400);

    expect(culturalTraitService.create).not.toHaveBeenCalled();
    expect(culturalTraitService.update).not.toHaveBeenCalled();
    expect(culturalTraitService.remove).not.toHaveBeenCalled();
  });

  describe.each(['verify', 'reject'] as const)('POST :id/%s', (action) => {
    const path = `${BASE_PATH}/${TRAIT_ID}/${action}`;
    const body = { reviewNote: 'Checked against the source' };

    it('returns 401 without a token, ignoring forged identity headers', async () => {
      await request(app.getHttpServer())
        .post(path)
        .set('x-user-id', TRAIT_ID)
        .set('x-role', 'ADMIN')
        .send(body)
        .expect(401);
      expect(culturalTraitService[action]).not.toHaveBeenCalled();
    });

    it.each([Role.VIEWER, Role.EDITOR])('returns 403 for %s', async (role) => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', bearerFor(role))
        .send(body)
        .expect(403);
      expect(culturalTraitService[action]).not.toHaveBeenCalled();
    });

    it.each([Role.VERIFIER, Role.ADMIN])(
      'records the %s caller as the reviewer',
      async (role) => {
        culturalTraitService[action].mockResolvedValue({ id: TRAIT_ID });

        await request(app.getHttpServer())
          .post(path)
          .set('Authorization', bearerFor(role))
          .send(body)
          .expect(200);

        expect(culturalTraitService[action]).toHaveBeenCalledWith(
          VILLAGE_ID,
          TRAIT_ID,
          { reviewerId: TEST_CALLER_ID },
          body,
        );
      },
    );

    it('rejects reviewer fields sent in the body', async () => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', bearerFor(Role.VERIFIER))
        .send({ ...body, reviewerId: TRAIT_ID, reviewedById: TRAIT_ID })
        .expect(400);
      expect(culturalTraitService[action]).not.toHaveBeenCalled();
    });
  });
});
