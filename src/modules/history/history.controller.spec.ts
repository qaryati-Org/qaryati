import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { setupApp } from '../../setup-app';
import { HistoryRecordType } from './entities/history-record.entity';
import { HistoryAuthenticationGuard } from './history-authentication.guard';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const RECORD_ID = '00000000-0000-4000-8000-000000000002';
const BASE_PATH = `/api/v1/villages/${VILLAGE_ID}/history`;

describe('HistoryController and authentication guard', () => {
  let app: INestApplication<App>;
  let historyService: {
    list: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    verify: jest.Mock;
    reject: jest.Mock;
  };

  beforeEach(async () => {
    const responseDto = {
      id: RECORD_ID,
      villageId: VILLAGE_ID,
      sourceId: '00000000-0000-4000-8000-000000000003',
      type: HistoryRecordType.EVENT,
      title: 'History record',
      description: 'Historical description',
      startYear: 1948,
      endYear: null,
      status: 'PENDING',
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      source: {
        id: '00000000-0000-4000-8000-000000000003',
        title: 'Source',
        type: 'BOOK',
        author: null,
        url: null,
        year: null,
      },
    };
    historyService = {
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
      controllers: [HistoryController],
      providers: [
        { provide: HistoryService, useValue: historyService },
        HistoryAuthenticationGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    setupApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows public GET and delegates listing filters and pagination', async () => {
    await request(app.getHttpServer())
      .get(`${BASE_PATH}?type=EVENT&page=2&limit=5`)
      .expect(200);

    expect(historyService.list).toHaveBeenCalledWith(
      VILLAGE_ID,
      expect.objectContaining({
        type: HistoryRecordType.EVENT,
        page: 2,
        limit: 5,
      }),
    );
  });

  it('rejects invalid UUID and query input on the public listing', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/villages/not-a-uuid/history')
      .expect(400);
    await request(app.getHttpServer())
      .get(`${BASE_PATH}?type=NOT_A_TYPE`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${BASE_PATH}?status=PENDING`)
      .expect(400);

    expect(historyService.list).not.toHaveBeenCalled();
  });

  it('allows CRUD routes under the current permissive RolesGuard', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({
        type: 'EVENT',
        title: 'History record',
        description: 'Historical description',
        sourceId: '00000000-0000-4000-8000-000000000003',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/${RECORD_ID}`)
      .send({ title: 'Updated title' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/${RECORD_ID}`)
      .expect(204);

    expect(historyService.create).toHaveBeenCalledTimes(1);
    expect(historyService.update).toHaveBeenCalledTimes(1);
    expect(historyService.remove).toHaveBeenCalledWith(VILLAGE_ID, RECORD_ID);
  });

  it('rejects invalid CRUD bodies and UUIDs before calling the service', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({ type: 'NOT_A_TYPE', reviewerId: RECORD_ID })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/villages/not-a-uuid/history')
      .send({
        type: 'EVENT',
        title: 'History record',
        description: 'Historical description',
        sourceId: '00000000-0000-4000-8000-000000000003',
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`${BASE_PATH}/not-a-uuid`)
      .send({ title: 'Updated title' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${BASE_PATH}/not-a-uuid`)
      .expect(400);

    expect(historyService.create).not.toHaveBeenCalled();
    expect(historyService.update).not.toHaveBeenCalled();
    expect(historyService.remove).not.toHaveBeenCalled();
  });

  it.each([
    ['verify', { reviewNote: 'Approved' }],
    ['reject', { reviewNote: 'Rejected' }],
  ])(
    'keeps the %s HTTP endpoint blocked without trusted auth',
    async (action, body) => {
      await request(app.getHttpServer())
        .post(`${BASE_PATH}/${RECORD_ID}/${action}`)
        .set('x-user-id', RECORD_ID)
        .set('x-role', 'ADMIN')
        .send(body)
        .expect(401);

      expect(historyService.verify).not.toHaveBeenCalled();
      expect(historyService.reject).not.toHaveBeenCalled();
    },
  );

  it('has a guard that always rejects without a trusted identity', () => {
    const guard = new HistoryAuthenticationGuard();

    expect(() => guard.canActivate()).toThrow(UnauthorizedException);
  });
});
