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
import { LandmarkType } from './entities/landmark.entity';
import { LandmarkController } from './landmark.controller';
import { LandmarkService } from './landmark.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const LANDMARK_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const BASE_PATH = `/api/v1/villages/${VILLAGE_ID}/landmarks`;

describe('LandmarkController with role enforcement', () => {
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
      imports: [...AUTH_TESTING_IMPORTS],
      controllers: [LandmarkController],
      providers: [
        { provide: LandmarkService, useValue: landmarkService },
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

  it('allows create, update, and delete as ADMIN', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Village spring',
        type: 'SPRING',
        description: 'A historical spring',
        sourceId: SOURCE_ID,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/${LANDMARK_ID}`)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({ name: 'Updated spring' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/${LANDMARK_ID}`)
      .set('Authorization', bearerFor(Role.ADMIN))
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
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: '  ',
        type: 'SPRING',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Valid name',
        type: 'UNKNOWN',
        description: 'Description',
        sourceId: SOURCE_ID,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/villages/not-a-uuid/landmarks')
      .set('Authorization', bearerFor(Role.ADMIN))
      .send({
        name: 'Valid name',
        type: 'SPRING',
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

    expect(landmarkService.create).not.toHaveBeenCalled();
    expect(landmarkService.update).not.toHaveBeenCalled();
    expect(landmarkService.remove).not.toHaveBeenCalled();
  });

  describe.each(['verify', 'reject'] as const)('POST :id/%s', (action) => {
    const path = `${BASE_PATH}/${LANDMARK_ID}/${action}`;
    const body = { reviewNote: 'Checked against the source' };

    it('returns 401 without a token, ignoring forged identity headers', async () => {
      await request(app.getHttpServer())
        .post(path)
        .set('x-user-id', LANDMARK_ID)
        .set('x-role', 'ADMIN')
        .send(body)
        .expect(401);
      expect(landmarkService[action]).not.toHaveBeenCalled();
    });

    it.each([Role.VIEWER, Role.EDITOR])('returns 403 for %s', async (role) => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', bearerFor(role))
        .send(body)
        .expect(403);
      expect(landmarkService[action]).not.toHaveBeenCalled();
    });

    it.each([Role.VERIFIER, Role.ADMIN])(
      'records the %s caller as the reviewer',
      async (role) => {
        landmarkService[action].mockResolvedValue({ id: LANDMARK_ID });

        await request(app.getHttpServer())
          .post(path)
          .set('Authorization', bearerFor(role))
          .send(body)
          .expect(200);

        expect(landmarkService[action]).toHaveBeenCalledWith(
          VILLAGE_ID,
          LANDMARK_ID,
          { reviewerId: TEST_CALLER_ID },
          body,
        );
      },
    );

    it('rejects reviewer fields sent in the body', async () => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', bearerFor(Role.VERIFIER))
        .send({ ...body, reviewerId: LANDMARK_ID, reviewedById: LANDMARK_ID })
        .expect(400);
      expect(landmarkService[action]).not.toHaveBeenCalled();
    });
  });
});
