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
    historyService = {
      list: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      }),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
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

  it.each([
    ['POST', '', { type: 'EVENT' }],
    ['PATCH', `/${RECORD_ID}`, { title: 'Updated' }],
    ['DELETE', `/${RECORD_ID}`, undefined],
    ['POST', `/${RECORD_ID}/verify`, { reviewNote: 'Approved' }],
    ['POST', `/${RECORD_ID}/reject`, { reviewNote: 'Rejected' }],
  ])(
    'fails closed for anonymous %s %s without calling the service',
    async (method, suffix, body) => {
      const url = `${BASE_PATH}${suffix}`;
      if (method === 'POST') {
        const operation = request(app.getHttpServer()).post(url);
        if (body !== undefined) {
          await operation.send(body).expect(401);
        } else {
          await operation.expect(401);
        }
      } else if (method === 'PATCH') {
        await request(app.getHttpServer()).patch(url).send(body).expect(401);
      } else {
        await request(app.getHttpServer()).delete(url).expect(401);
      }

      expect(historyService.create).not.toHaveBeenCalled();
      expect(historyService.update).not.toHaveBeenCalled();
      expect(historyService.remove).not.toHaveBeenCalled();
      expect(historyService.verify).not.toHaveBeenCalled();
      expect(historyService.reject).not.toHaveBeenCalled();
    },
  );

  it('returns 401 before validating write-body content', async () => {
    await request(app.getHttpServer())
      .post(BASE_PATH)
      .send({ type: 'NOT_A_TYPE', reviewerId: RECORD_ID })
      .expect(401);

    expect(historyService.create).not.toHaveBeenCalled();
  });

  it('has a guard that always rejects without a trusted identity', () => {
    const guard = new HistoryAuthenticationGuard();

    expect(() => guard.canActivate()).toThrow(UnauthorizedException);
  });
});
