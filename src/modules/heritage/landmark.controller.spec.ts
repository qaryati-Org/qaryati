import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { setupApp } from '../../setup-app';
import { LandmarkType } from './entities/landmark.entity';
import { LandmarkReviewAuthenticationGuard } from './landmark-review-authentication.guard';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const LANDMARK_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const BASE_PATH = `/api/v1/villages/${VILLAGE_ID}/landmarks`;

describe('LandmarkController and review authentication guard', () => {
  let app: INestApplication<App>;
  let landmarkService: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    verify: jest.Mock;
    reject: jest.Mock;
  };

  beforeEach(async () => {
    const responseDto = {
      id: LANDMARK_ID,
      villageId: VILLAGE_ID,
      sourceId: SOURCE_ID,
      name: 'Village spring',
      type: LandmarkType.SPRING,
      description: 'A historical spring',
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
    landmarkService = {
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
      controllers: [LandmarkController],
      providers: [
        { provide: LandmarkService, useValue: landmarkService },
        LandmarkReviewAuthenticationGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows public GET and delegates filters and pagination', async () => {
    await request(app.getHttpServer())
      .get(`${BASE_PATH}?type=SPRING&page=2&limit=5`)
      .expect(200);

    expect(landmarkService.list).toHaveBeenCalledWith(
      VILLAGE_ID,
      expect.objectContaining({
        type: LandmarkType.SPRING,
        page: 2,
        limit: 5,
      }),
    );
  });

  it('allows create, update, and delete under the permissive RolesGuard', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({
        name: 'Village spring',
        type: 'SPRING',
        description: 'A historical spring',
        sourceId: SOURCE_ID,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/${LANDMARK_ID}`)
      .send({ name: 'Updated spring' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/${LANDMARK_ID}`)
      .expect(204);

    expect(landmarkService.create).toHaveBeenCalledTimes(1);
    expect(landmarkService.update).toHaveBeenCalledTimes(1);
    expect(landmarkService.remove).toHaveBeenCalledWith(
      VILLAGE_ID,
      LANDMARK_ID,
    );
  });

  it('rejects invalid request bodies and UUIDs before service calls', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({
        name: '  ',
        type: 'SPRING',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({
        name: 'Valid name',
        type: 'UNKNOWN',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/villages/not-a-uuid/landmarks')
      .send({
        name: 'Valid name',
        type: 'SPRING',
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

    expect(landmarkService.create).not.toHaveBeenCalled();
    expect(landmarkService.update).not.toHaveBeenCalled();
    expect(landmarkService.remove).not.toHaveBeenCalled();
  });

  it.each([
    ['verify', { reviewNote: 'Evidence confirmed' }],
    ['reject', { reviewNote: 'Insufficient evidence' }],
  ])(
    'blocks %s even with forged reviewer headers and body fields',
    async (action, reviewBody) => {
      await request(app.getHttpServer())
        .post(`${BASE_PATH}/${LANDMARK_ID}/${action}`)
        .set('x-user-id', LANDMARK_ID)
        .set('x-role', 'ADMIN')
        .send({
          ...reviewBody,
          reviewerId: LANDMARK_ID,
          reviewedById: LANDMARK_ID,
          status: 'VERIFIED',
          role: 'ADMIN',
        })
        .expect(401);

      expect(landmarkService.verify).not.toHaveBeenCalled();
      expect(landmarkService.reject).not.toHaveBeenCalled();
    },
  );

  it('has a guard that always rejects without trusted authentication', () => {
    const guard = new LandmarkReviewAuthenticationGuard();

    expect(() => guard.canActivate()).toThrow(UnauthorizedException);
  });
});
