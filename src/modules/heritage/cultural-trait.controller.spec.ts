import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { setupApp } from '../../setup-app';
import { CulturalTraitType } from './entities/cultural-trait.entity';
import { CulturalTraitReviewAuthenticationGuard } from './cultural-trait-review-authentication.guard';
import { CulturalTraitController } from './cultural-trait.controller';
import { CulturalTraitService } from './cultural-trait.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const TRAIT_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const BASE_PATH = `/api/v1/villages/${VILLAGE_ID}/cultural-traits`;

describe('CulturalTraitController and review authentication guard', () => {
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
      controllers: [CulturalTraitController],
      providers: [
        { provide: CulturalTraitService, useValue: culturalTraitService },
        CulturalTraitReviewAuthenticationGuard,
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
      .send({
        name: 'Traditional weaving',
        type: 'CRAFT',
        description: 'A locally practiced weaving tradition',
        sourceId: SOURCE_ID,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/${TRAIT_ID}`)
      .send({ name: 'Updated weaving' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/${TRAIT_ID}`)
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
      .send({
        name: 'Traditional food',
        type: 'UNKNOWN',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({
        name: '  ',
        type: 'FOOD',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({
        name: 'Valid name',
        type: 'FOOD',
        description: '   ',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/${TRAIT_ID}`)
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
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
      .send({
        name: 'Valid name',
        type: 'FOOD',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/not-a-uuid`)
      .send({ name: 'Updated name' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/not-a-uuid`)
      .expect(400);

    expect(culturalTraitService.create).not.toHaveBeenCalled();
    expect(culturalTraitService.update).not.toHaveBeenCalled();
    expect(culturalTraitService.remove).not.toHaveBeenCalled();
  });

  it.each([
    ['verify', { reviewNote: 'Evidence confirmed' }],
    ['reject', { reviewNote: 'Insufficient evidence' }],
  ])(
    'blocks %s despite forged reviewer headers and body fields',
    async (action, reviewBody) => {
      await request(app.getHttpServer())
        .post(`${BASE_PATH}/${TRAIT_ID}/${action}`)
        .set('x-user-id', TRAIT_ID)
        .set('x-role', 'ADMIN')
        .send({
          ...reviewBody,
          reviewerId: TRAIT_ID,
          reviewedById: TRAIT_ID,
          reviewedAt: new Date().toISOString(),
          status: 'VERIFIED',
          role: 'ADMIN',
        })
        .expect(401);

      expect(culturalTraitService.verify).not.toHaveBeenCalled();
      expect(culturalTraitService.reject).not.toHaveBeenCalled();
    },
  );

  it('has a review guard that always rejects without trusted authentication', () => {
    const guard = new CulturalTraitReviewAuthenticationGuard();

    expect(() => guard.canActivate()).toThrow(UnauthorizedException);
  });
});
