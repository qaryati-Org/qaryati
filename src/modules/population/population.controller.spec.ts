import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createOpenApiDocument } from '../../openapi';
import { setupApp } from '../../setup-app';
import {
  AUTH_TESTING_IMPORTS,
  AUTH_TESTING_PROVIDERS,
  bearerFor,
} from '../../../test/utils/unit-auth';
import { Role } from '../auth';
import { SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { PopulationController } from './population.controller';
import { PopulationService } from './population.service';
import { PopulationRecord } from './entities/population-record.entity';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VILLAGE_ID = '00000000-0000-4000-8000-000000000002';
const VERIFIED_ID = '00000000-0000-4000-8000-000000000003';
const PENDING_ID = '00000000-0000-4000-8000-000000000004';
const REJECTED_ID = '00000000-0000-4000-8000-000000000005';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000006';
const SOURCE_ID = '00000000-0000-4000-8000-000000000007';
const BASE_PATH = `/api/v1/villages/${VILLAGE_ID}/population-records`;

const records: PopulationRecord[] = [
  {
    id: VERIFIED_ID,
    villageId: VILLAGE_ID,
    sourceId: SOURCE_ID,
    value: 1200,
    referenceYear: 1997,
    status: VerificationStatus.VERIFIED,
    reviewedAt: null,
    reviewedById: null,
    reviewNote: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    id: PENDING_ID,
    villageId: VILLAGE_ID,
    sourceId: SOURCE_ID,
    value: 1300,
    referenceYear: 2007,
    status: VerificationStatus.PENDING,
    reviewedAt: null,
    reviewedById: null,
    reviewNote: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    id: REJECTED_ID,
    villageId: VILLAGE_ID,
    sourceId: SOURCE_ID,
    value: 1100,
    referenceYear: 2017,
    status: VerificationStatus.REJECTED,
    reviewedAt: null,
    reviewedById: null,
    reviewNote: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
];

describe('PopulationController read access', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    let selectedStatus = VerificationStatus.VERIFIED;
    const queryBuilder: {
      where: jest.Mock;
      andWhere: jest.Mock;
      orderBy: jest.Mock;
      addOrderBy: jest.Mock;
      skip: jest.Mock;
      take: jest.Mock;
      getManyAndCount: jest.Mock;
    } = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount: jest.fn((): Promise<[PopulationRecord[], number]> => {
        const matching = records.filter(
          (record) => record.status === selectedStatus,
        );
        return Promise.resolve([matching, matching.length]);
      }),
    };
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockImplementation(
      (condition: string, params: { status?: VerificationStatus }) => {
        if (condition === 'record.status = :status' && params.status) {
          selectedStatus = params.status;
        }
        return queryBuilder;
      },
    );
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder);
    queryBuilder.skip.mockReturnValue(queryBuilder);
    queryBuilder.take.mockReturnValue(queryBuilder);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOneBy: jest.fn(
        (where: {
          id: string;
          villageId: string;
        }): Promise<PopulationRecord | null> =>
          Promise.resolve(
            records.find(
              (record) =>
                record.id === where.id && record.villageId === where.villageId,
            ) ?? null,
          ),
      ),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [...AUTH_TESTING_IMPORTS],
      controllers: [PopulationController],
      providers: [
        PopulationService,
        {
          provide: getRepositoryToken(PopulationRecord),
          useValue: repository,
        },
        {
          provide: VillageService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ id: VILLAGE_ID }),
          },
        },
        {
          provide: SourceService,
          useValue: {
            ensureExists: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: DataSource, useValue: { query: jest.fn() } },
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

  it('documents optional bearer authorization for both Population read routes', () => {
    const document = createOpenApiDocument(app);
    const listSecurity =
      document.paths['/api/v1/villages/{villageId}/population-records']?.get
        ?.security;
    const findOneSecurity =
      document.paths['/api/v1/villages/{villageId}/population-records/{id}']
        ?.get?.security;

    for (const security of [listSecurity, findOneSecurity]) {
      expect(security).toHaveLength(2);
      expect(security).toEqual(expect.arrayContaining([{}, { bearer: [] }]));
    }
  });

  it('keeps default and explicit VERIFIED lists public', async () => {
    for (const suffix of ['', '?status=VERIFIED']) {
      for (const headers of [
        undefined,
        { Authorization: bearerFor(Role.VIEWER) },
      ]) {
        let testRequest = request(app.getHttpServer()).get(
          `${BASE_PATH}${suffix}`,
        );
        if (headers) {
          testRequest = testRequest.set(headers);
        }
        const response = await testRequest.expect(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({
          id: VERIFIED_ID,
          status: VerificationStatus.VERIFIED,
        });
      }
    }
  });

  it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
    'restricts %s list results by authenticated role',
    async (status) => {
      const url = `${BASE_PATH}?status=${status}`;
      await request(app.getHttpServer()).get(url).expect(401);
      await request(app.getHttpServer())
        .get(url)
        .set('x-user-id', 'forged-user')
        .set('x-role', Role.ADMIN)
        .expect(401);
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', bearerFor(Role.VIEWER))
        .set('x-role', Role.ADMIN)
        .expect(403);

      for (const role of [Role.EDITOR, Role.VERIFIER, Role.ADMIN]) {
        const response = await request(app.getHttpServer())
          .get(url)
          .set('Authorization', bearerFor(role))
          .expect(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].status).toBe(status);
      }
    },
  );

  it('keeps VERIFIED record lookup public for every role', async () => {
    for (const authorization of [
      undefined,
      bearerFor(Role.VIEWER),
      bearerFor(Role.EDITOR),
      bearerFor(Role.VERIFIER),
      bearerFor(Role.ADMIN),
    ]) {
      let testRequest = request(app.getHttpServer()).get(
        `${BASE_PATH}/${VERIFIED_ID}`,
      );
      if (authorization) {
        testRequest = testRequest.set('Authorization', authorization);
      }
      await testRequest.expect(200).expect(({ body }) =>
        expect(body).toMatchObject({
          id: VERIFIED_ID,
          status: VerificationStatus.VERIFIED,
        }),
      );
    }
  });

  it.each([
    [VerificationStatus.PENDING, PENDING_ID],
    [VerificationStatus.REJECTED, REJECTED_ID],
  ])('restricts %s record lookup by authenticated role', async (status, id) => {
    const url = `${BASE_PATH}/${id}`;
    await request(app.getHttpServer()).get(url).expect(401);
    await request(app.getHttpServer())
      .get(url)
      .set('x-user-id', 'forged-user')
      .set('x-role', Role.ADMIN)
      .expect(401);
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', bearerFor(Role.VIEWER))
      .set('x-role', Role.ADMIN)
      .expect(403);

    for (const role of [Role.EDITOR, Role.VERIFIER, Role.ADMIN]) {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', bearerFor(role))
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ id, status });
        });
    }
  });

  it('preserves 400 and 404 for malformed, missing, and wrong-village IDs', async () => {
    await request(app.getHttpServer())
      .get(`${BASE_PATH}/not-a-uuid`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`${BASE_PATH}/${UNKNOWN_ID}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `/api/v1/villages/${OTHER_VILLAGE_ID}/population-records/${PENDING_ID}`,
      )
      .expect(404);
  });
});
