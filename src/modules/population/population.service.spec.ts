import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ValidationException } from '../../common/errors/validation.exception';
import type { AuthenticatedUser } from '../auth';
import { Role } from '../auth';
import { SourceService } from '../source/source.service';
import { canTransition, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreatePopulationRecordDto } from './dto/create-population-record.dto';
import { PopulationHistoryQueryDto } from './dto/population-history-query.dto';
import { PopulationHistorySqlRow } from './dto/population-history-response.dto';
import { PopulationRecordQueryDto } from './dto/population-record-query.dto';
import { UpdatePopulationRecordDto } from './dto/update-population-record.dto';
import { PopulationRecord } from './entities/population-record.entity';
import {
  POPULATION_HISTORY_SQL,
  PopulationReviewerContext,
  PopulationService,
} from './population.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VILLAGE_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_SOURCE_ID = '00000000-0000-4000-8000-000000000004';
const RECORD_ID = '00000000-0000-4000-8000-000000000005';
const REVIEWER_ID = '00000000-0000-4000-8000-000000000006';
const userFor = (role: Role): AuthenticatedUser => ({
  id: REVIEWER_ID,
  email: `${role.toLowerCase()}@example.test`,
  role,
});
const DUPLICATE_CONSTRAINT = 'uq_population_records_village_year_value_source';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

const populationRecord = (
  overrides: Partial<PopulationRecord> = {},
): PopulationRecord => ({
  id: RECORD_ID,
  villageId: VILLAGE_ID,
  sourceId: SOURCE_ID,
  value: 1200,
  referenceYear: 1997,
  status: VerificationStatus.PENDING,
  reviewedAt: null,
  reviewedById: null,
  reviewNote: null,
  createdAt,
  updatedAt,
  ...overrides,
});

const createDto = (
  overrides: Partial<CreatePopulationRecordDto> = {},
): CreatePopulationRecordDto =>
  Object.assign(new CreatePopulationRecordDto(), {
    value: 1200,
    referenceYear: 1997,
    sourceId: SOURCE_ID,
    ...overrides,
  });

const queryDto = (
  overrides: Partial<PopulationRecordQueryDto> = {},
): PopulationRecordQueryDto =>
  Object.assign(new PopulationRecordQueryDto(), overrides);

const historyQueryDto = (
  overrides: Partial<PopulationHistoryQueryDto> = {},
): PopulationHistoryQueryDto =>
  Object.assign(new PopulationHistoryQueryDto(), overrides);

const historyRow = (
  overrides: Partial<PopulationHistorySqlRow> = {},
): PopulationHistorySqlRow => ({
  id: RECORD_ID,
  villageId: VILLAGE_ID,
  sourceId: SOURCE_ID,
  referenceYear: 1997,
  value: 1200,
  previousReferenceYear: null,
  previousValue: null,
  populationChange: null,
  ...overrides,
});

const historySource = (id: string, title: string) => ({
  id,
  title,
  type: 'BOOK',
  author: 'Historical Office',
  url: `https://example.test/${id}`,
  year: 1996,
});

function pgError(code: string, constraint?: string): Error {
  const error = Object.assign(new Error(`database error ${code}`), { code });
  return constraint === undefined
    ? error
    : Object.assign(error, { constraint });
}

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject');
}

describe('PopulationService', () => {
  let repository: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };
  let villages: { ensureExists: jest.Mock };
  let sources: { ensureExists: jest.Mock; findByIds: jest.Mock };
  let dataSource: { query: jest.Mock };
  let service: PopulationService;

  beforeEach(() => {
    jest.clearAllMocks();

    queryBuilder = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder);
    queryBuilder.skip.mockReturnValue(queryBuilder);
    queryBuilder.take.mockReturnValue(queryBuilder);

    repository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((fields: Partial<PopulationRecord>) =>
        populationRecord(fields),
      ),
      save: jest.fn((record: PopulationRecord) =>
        Promise.resolve(populationRecord(record)),
      ),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    villages = { ensureExists: jest.fn().mockResolvedValue(undefined) };
    sources = {
      ensureExists: jest.fn().mockResolvedValue(undefined),
      findByIds: jest.fn().mockResolvedValue([]),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([{ total: 0, rows: [] }]),
    };

    service = new PopulationService(
      repository as unknown as Repository<PopulationRecord>,
      villages as unknown as VillageService,
      sources as unknown as SourceService,
      dataSource as unknown as DataSource,
    );
  });

  describe('create', () => {
    it('creates a PENDING record and returns only mapped response fields', async () => {
      const currentYear = new Date().getFullYear();
      const dto = Object.assign(createDto(), {
        value: 0,
        referenceYear: currentYear,
        status: VerificationStatus.VERIFIED,
        reviewedAt: updatedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'client-controlled review data',
      });
      repository.save.mockResolvedValue(
        populationRecord({
          value: 0,
          referenceYear: currentYear,
          village: { id: VILLAGE_ID },
          source: { id: SOURCE_ID },
          reviewedBy: { id: REVIEWER_ID },
        }),
      );

      const result = await service.create(VILLAGE_ID, dto);

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(sources.ensureExists).toHaveBeenCalledWith(SOURCE_ID);
      expect(repository.create).toHaveBeenCalledWith({
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        value: 0,
        referenceYear: currentYear,
        status: VerificationStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          villageId: VILLAGE_ID,
          sourceId: SOURCE_ID,
          value: 0,
          referenceYear: currentYear,
          status: VerificationStatus.PENDING,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: null,
        }),
      );
      expect(result).toEqual({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        value: 0,
        referenceYear: currentYear,
        status: VerificationStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        createdAt,
        updatedAt,
      });
      expect(result).not.toHaveProperty('village');
      expect(result).not.toHaveProperty('source');
      expect(result).not.toHaveProperty('reviewedBy');
    });

    it('rejects a future reference year with a 400 field validation error', async () => {
      const error = await captureError(() =>
        service.create(
          VILLAGE_ID,
          createDto({ referenceYear: new Date().getFullYear() + 1 }),
        ),
      );

      expect(error).toBeInstanceOf(ValidationException);
      if (error instanceof ValidationException) {
        expect(error.getStatus()).toBe(400);
        expect(error.fieldErrors).toContainEqual(
          expect.objectContaining({
            field: 'referenceYear',
            messages: expect.arrayContaining([
              'referenceYear cannot be in the future',
            ]),
          }),
        );
      }
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('does not save when the village does not exist', async () => {
      villages.ensureExists.mockRejectedValue(
        new NotFoundException(`Village ${VILLAGE_ID} not found`),
      );

      const error = await captureError(() =>
        service.create(VILLAGE_ID, createDto()),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      if (error instanceof NotFoundException) {
        expect(error.getStatus()).toBe(404);
      }
      expect(repository.save).not.toHaveBeenCalled();
      expect(sources.ensureExists).not.toHaveBeenCalled();
    });

    it('does not save when the source does not exist', async () => {
      sources.ensureExists.mockRejectedValue(
        new UnprocessableEntityException(`Source ${SOURCE_ID} does not exist`),
      );

      const error = await captureError(() =>
        service.create(VILLAGE_ID, createDto()),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      if (error instanceof UnprocessableEntityException) {
        expect(error.getStatus()).toBe(422);
      }
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('duplicate handling', () => {
    it('converts the duplicate population constraint violation to 409', async () => {
      repository.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT INTO population_records',
          [],
          pgError('23505', DUPLICATE_CONSTRAINT),
        ),
      );

      const error = await captureError(() =>
        service.create(VILLAGE_ID, createDto()),
      );

      expect(error).toBeInstanceOf(ConflictException);
      if (error instanceof ConflictException) {
        expect(error.getStatus()).toBe(409);
      }
    });

    it('rethrows a unique violation from a different constraint unchanged', async () => {
      const failure = new QueryFailedError(
        'INSERT INTO population_records',
        [],
        pgError('23505', 'uq_population_records_verified_village_year'),
      );
      repository.save.mockRejectedValue(failure);

      const error = await captureError(() =>
        service.create(VILLAGE_ID, createDto()),
      );

      expect(error).toBe(failure);
    });

    it('rethrows database connection errors unchanged', async () => {
      const failure = new QueryFailedError(
        'INSERT INTO population_records',
        [],
        pgError('08006'),
      );
      repository.save.mockRejectedValue(failure);

      const error = await captureError(() =>
        service.create(VILLAGE_ID, createDto()),
      );

      expect(error).toBe(failure);
    });

    it('rethrows ordinary errors unchanged', async () => {
      const failure = new Error('Unexpected persistence error');
      repository.save.mockRejectedValue(failure);

      const error = await captureError(() =>
        service.create(VILLAGE_ID, createDto()),
      );

      expect(error).toBe(failure);
    });
  });

  describe('findOne', () => {
    it('searches by both IDs and maps an authorized unverified record', async () => {
      const record = populationRecord({
        village: { id: VILLAGE_ID },
        source: { id: SOURCE_ID },
        reviewedBy: { id: REVIEWER_ID },
      });
      repository.findOneBy.mockResolvedValue(record);

      const result = await service.findOne(
        VILLAGE_ID,
        RECORD_ID,
        userFor(Role.EDITOR),
      );

      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
      });
      expect(result).toEqual({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        value: 1200,
        referenceYear: 1997,
        status: VerificationStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        createdAt,
        updatedAt,
      });
      expect(result).not.toHaveProperty('village');
      expect(result).not.toHaveProperty('source');
      expect(result).not.toHaveProperty('reviewedBy');
    });

    it('throws 404 when the record does not exist', async () => {
      const error = await captureError(() =>
        service.findOne(VILLAGE_ID, RECORD_ID),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      if (error instanceof NotFoundException) {
        expect(error.getStatus()).toBe(404);
      }
    });

    it('does not return a record belonging to another village', async () => {
      repository.findOneBy.mockResolvedValue(null);

      const error = await captureError(() =>
        service.findOne(VILLAGE_ID, RECORD_ID),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
      });
    });

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'requires authentication to return %s records',
      async (status) => {
        repository.findOneBy.mockResolvedValue(populationRecord({ status }));

        await expect(
          service.findOne(VILLAGE_ID, RECORD_ID),
        ).rejects.toMatchObject({ status: 401 });
      },
    );

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'forbids VIEWER access to %s records',
      async (status) => {
        repository.findOneBy.mockResolvedValue(populationRecord({ status }));

        await expect(
          service.findOne(VILLAGE_ID, RECORD_ID, userFor(Role.VIEWER)),
        ).rejects.toMatchObject({ status: 403 });
      },
    );

    it.each([Role.EDITOR, Role.VERIFIER, Role.ADMIN])(
      'allows %s to read unverified records',
      async (role) => {
        repository.findOneBy.mockResolvedValue(
          populationRecord({ status: VerificationStatus.REJECTED }),
        );

        await expect(
          service.findOne(VILLAGE_ID, RECORD_ID, userFor(role)),
        ).resolves.toMatchObject({ status: VerificationStatus.REJECTED });
      },
    );

    it.each([undefined, userFor(Role.VIEWER)])(
      'keeps VERIFIED records public for caller %s',
      async (user) => {
        repository.findOneBy.mockResolvedValue(
          populationRecord({ status: VerificationStatus.VERIFIED }),
        );

        await expect(
          service.findOne(VILLAGE_ID, RECORD_ID, user),
        ).resolves.toMatchObject({ status: VerificationStatus.VERIFIED });
      },
    );
  });

  describe('history', () => {
    it('checks that the village exists before executing the SQL query', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 0, rows: [] }]);

      await service.history(VILLAGE_ID, historyQueryDto());

      expect(villages.ensureExists.mock.invocationCallOrder[0]).toBeLessThan(
        dataSource.query.mock.invocationCallOrder[0],
      );
    });

    it('propagates an unknown village error without executing SQL', async () => {
      const error = new NotFoundException('Village not found');
      villages.ensureExists.mockRejectedValueOnce(error);

      await expect(service.history(VILLAGE_ID, historyQueryDto())).rejects.toBe(
        error,
      );
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('executes the native SQL with parameterized village and pagination values', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 0, rows: [] }]);
      const query = historyQueryDto({ page: 3, limit: 5 });

      await service.history(VILLAGE_ID, query);

      expect(dataSource.query).toHaveBeenCalledWith(POPULATION_HISTORY_SQL, [
        VILLAGE_ID,
        5,
        10,
      ]);
    });

    it('uses LAG over verified records before applying outer pagination', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 0, rows: [] }]);

      await service.history(VILLAGE_ID, historyQueryDto());

      const sql = dataSource.query.mock.calls[0][0] as string;
      const verifiedFilter = sql.indexOf("AND status = 'VERIFIED'");
      const windowDefinition = sql.indexOf('WINDOW history AS');
      const pagination = sql.indexOf('LIMIT $2 OFFSET $3');
      expect(sql).toContain('LAG(reference_year)');
      expect(sql).toContain('LAG(value)');
      expect(verifiedFilter).toBeGreaterThan(-1);
      expect(verifiedFilter).toBeLessThan(windowDefinition);
      expect(windowDefinition).toBeLessThan(pagination);
    });

    it('maps query results to response DTOs with their matching sources', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          total: 1,
          rows: [
            historyRow({
              referenceYear: 2007,
              value: 1500,
              previousReferenceYear: 1997,
              previousValue: 1200,
              populationChange: 300,
            }),
          ],
        },
      ]);
      sources.findByIds.mockResolvedValueOnce([
        historySource(SOURCE_ID, '1997 Census'),
      ]);

      const result = await service.history(VILLAGE_ID, historyQueryDto());

      expect(result.data).toEqual([
        {
          id: RECORD_ID,
          villageId: VILLAGE_ID,
          referenceYear: 2007,
          value: 1500,
          previousReferenceYear: 1997,
          previousValue: 1200,
          populationChange: 300,
          source: {
            id: SOURCE_ID,
            title: '1997 Census',
            type: 'BOOK',
            author: 'Historical Office',
            url: `https://example.test/${SOURCE_ID}`,
            year: 1996,
          },
        },
      ]);
    });

    it('converts PostgreSQL numeric strings to numbers', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          total: '1',
          rows: [
            historyRow({
              referenceYear: '2007',
              value: '1500',
              previousReferenceYear: '1997',
              previousValue: '1200',
              populationChange: '300',
            }),
          ],
        },
      ]);
      sources.findByIds.mockResolvedValueOnce([
        historySource(SOURCE_ID, 'Census'),
      ]);

      const result = await service.history(VILLAGE_ID, historyQueryDto());

      expect(result.data[0]).toMatchObject({
        referenceYear: 2007,
        value: 1500,
        previousReferenceYear: 1997,
        previousValue: 1200,
        populationChange: 300,
      });
      expect(result.meta.total).toBe(1);
    });

    it('preserves null previous-year, previous-value, and change fields', async () => {
      dataSource.query.mockResolvedValueOnce([
        { total: 1, rows: [historyRow()] },
      ]);
      sources.findByIds.mockResolvedValueOnce([
        historySource(SOURCE_ID, 'Census'),
      ]);

      const result = await service.history(VILLAGE_ID, historyQueryDto());

      expect(result.data[0]).toMatchObject({
        previousReferenceYear: null,
        previousValue: null,
        populationChange: null,
      });
    });

    it('fetches multiple source IDs in one bulk lookup', async () => {
      const secondSourceId = OTHER_SOURCE_ID;
      dataSource.query.mockResolvedValueOnce([
        {
          total: 2,
          rows: [
            historyRow({ id: RECORD_ID, sourceId: SOURCE_ID }),
            historyRow({
              id: REVIEWER_ID,
              sourceId: secondSourceId,
              referenceYear: 2007,
            }),
          ],
        },
      ]);
      sources.findByIds.mockResolvedValueOnce([
        historySource(SOURCE_ID, 'First source'),
        historySource(secondSourceId, 'Second source'),
      ]);

      await service.history(VILLAGE_ID, historyQueryDto());

      expect(sources.findByIds).toHaveBeenCalledTimes(1);
      expect(sources.findByIds).toHaveBeenCalledWith([
        SOURCE_ID,
        secondSourceId,
      ]);
    });

    it('deduplicates source IDs before the bulk lookup', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          total: 2,
          rows: [
            historyRow({ id: RECORD_ID, sourceId: SOURCE_ID }),
            historyRow({
              id: REVIEWER_ID,
              sourceId: SOURCE_ID,
              referenceYear: 2007,
            }),
          ],
        },
      ]);
      sources.findByIds.mockResolvedValueOnce([
        historySource(SOURCE_ID, 'Shared source'),
      ]);

      const result = await service.history(VILLAGE_ID, historyQueryDto());

      expect(sources.findByIds).toHaveBeenCalledWith([SOURCE_ID]);
      expect(result.data.map((item) => item.source.title)).toEqual([
        'Shared source',
        'Shared source',
      ]);
    });

    it('associates each observation with the source matching its source ID', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          total: 2,
          rows: [
            historyRow({ id: RECORD_ID, sourceId: SOURCE_ID }),
            historyRow({
              id: REVIEWER_ID,
              sourceId: OTHER_SOURCE_ID,
              referenceYear: 2007,
            }),
          ],
        },
      ]);
      sources.findByIds.mockResolvedValueOnce([
        historySource(OTHER_SOURCE_ID, 'Second source'),
        historySource(SOURCE_ID, 'First source'),
      ]);

      const result = await service.history(VILLAGE_ID, historyQueryDto());

      expect(result.data.map((item) => item.source.title)).toEqual([
        'First source',
        'Second source',
      ]);
    });

    it('returns an empty history without looking up sources', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 0, rows: [] }]);

      const result = await service.history(VILLAGE_ID, historyQueryDto());

      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      expect(sources.findByIds).not.toHaveBeenCalled();
    });

    it('preserves total and pagination metadata for an empty page', async () => {
      dataSource.query.mockResolvedValueOnce([{ total: 7, rows: [] }]);

      const result = await service.history(
        VILLAGE_ID,
        historyQueryDto({ page: 4, limit: 2 }),
      );

      expect(result).toEqual({
        data: [],
        meta: { page: 4, limit: 2, total: 7, totalPages: 4 },
      });
    });

    it('throws a server error when a returned observation has no source', async () => {
      dataSource.query.mockResolvedValueOnce([
        { total: 1, rows: [historyRow()] },
      ]);
      sources.findByIds.mockResolvedValueOnce([]);

      await expect(
        service.history(VILLAGE_ID, historyQueryDto()),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('propagates database query failures', async () => {
      const error = new Error('database unavailable');
      dataSource.query.mockRejectedValueOnce(error);

      await expect(service.history(VILLAGE_ID, historyQueryDto())).rejects.toBe(
        error,
      );
    });
  });

  describe('verification and rejection', () => {
    const reviewer: PopulationReviewerContext = { reviewerId: REVIEWER_ID };
    const updateResult = (record?: PopulationRecord) => [
      record ? [record] : [],
      record ? 1 : 0,
    ];

    it('transitions PENDING to VERIFIED and maps the updated response', async () => {
      const reviewedAt = new Date('2026-03-01T12:00:00.000Z');
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      dataSource.query.mockResolvedValueOnce(
        updateResult(
          populationRecord({
            status: VerificationStatus.VERIFIED,
            reviewedAt,
            reviewedById: REVIEWER_ID,
            reviewNote: 'Evidence confirmed',
          }),
        ),
      );

      const result = await service.verify(VILLAGE_ID, RECORD_ID, reviewer, {
        reviewNote: 'Evidence confirmed',
      });

      expect(
        canTransition(VerificationStatus.PENDING, VerificationStatus.VERIFIED),
      ).toBe(true);
      expect(result).toEqual({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        value: 1200,
        referenceYear: 1997,
        status: VerificationStatus.VERIFIED,
        reviewedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Evidence confirmed',
        createdAt,
        updatedAt,
      });
    });

    it('transitions PENDING to REJECTED', async () => {
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      dataSource.query.mockResolvedValueOnce(
        updateResult(
          populationRecord({
            status: VerificationStatus.REJECTED,
            reviewedAt: updatedAt,
            reviewedById: REVIEWER_ID,
            reviewNote: 'Conflicting source',
          }),
        ),
      );

      const result = await service.reject(VILLAGE_ID, RECORD_ID, reviewer, {
        reviewNote: 'Conflicting source',
      });

      expect(
        canTransition(VerificationStatus.PENDING, VerificationStatus.REJECTED),
      ).toBe(true);
      expect(result.status).toBe(VerificationStatus.REJECTED);
      expect(result.reviewedById).toBe(REVIEWER_ID);
      expect(result.reviewNote).toBe('Conflicting source');
    });

    it('transitions VERIFIED to REJECTED', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        populationRecord({ status: VerificationStatus.VERIFIED }),
      );
      dataSource.query.mockResolvedValueOnce(
        updateResult(
          populationRecord({
            status: VerificationStatus.REJECTED,
            reviewedAt: updatedAt,
            reviewedById: REVIEWER_ID,
            reviewNote: 'Verification was incorrect',
          }),
        ),
      );

      const result = await service.reject(VILLAGE_ID, RECORD_ID, reviewer, {
        reviewNote: 'Verification was incorrect',
      });

      expect(
        canTransition(VerificationStatus.VERIFIED, VerificationStatus.REJECTED),
      ).toBe(true);
      expect(result.status).toBe(VerificationStatus.REJECTED);
    });

    it.each([
      [VerificationStatus.REJECTED, 'verify', VerificationStatus.VERIFIED],
      [VerificationStatus.REJECTED, 'reject', VerificationStatus.REJECTED],
      [VerificationStatus.VERIFIED, 'verify', VerificationStatus.VERIFIED],
    ] as const)(
      'rejects the disallowed %s to %s transition with 409',
      async (initialStatus, action, targetStatus) => {
        repository.findOneBy.mockResolvedValueOnce(
          populationRecord({ status: initialStatus }),
        );
        const transition = canTransition(initialStatus, targetStatus);
        const operation =
          action === 'verify'
            ? service.verify(VILLAGE_ID, RECORD_ID, reviewer, {})
            : service.reject(VILLAGE_ID, RECORD_ID, reviewer, {
                reviewNote: 'Rejected again',
              });

        expect(transition).toBe(false);
        await expect(operation).rejects.toBeInstanceOf(ConflictException);
        expect(dataSource.query).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for an unknown population record', async () => {
      const error = await captureError(() =>
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {}),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
      });
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('scopes missing-record lookup to the requested village', async () => {
      const error = await captureError(() =>
        service.verify(OTHER_VILLAGE_ID, RECORD_ID, reviewer, {}),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: OTHER_VILLAGE_ID,
      });
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('compares record ID, village ID, and expected status in the atomic update', async () => {
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      dataSource.query.mockResolvedValueOnce(
        updateResult(populationRecord({ status: VerificationStatus.VERIFIED })),
      );

      await expect(
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {}),
      ).resolves.toMatchObject({
        status: VerificationStatus.VERIFIED,
      });

      const [sql, parameters] = dataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toMatch(
        /WHERE id = \$5\s+AND village_id = \$6\s+AND status = \$7/,
      );
      expect(parameters.slice(4)).toEqual([
        RECORD_ID,
        VILLAGE_ID,
        VerificationStatus.PENDING,
      ]);
    });

    it('updates status and all review metadata together', async () => {
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      dataSource.query.mockResolvedValueOnce(
        updateResult(
          populationRecord({
            status: VerificationStatus.VERIFIED,
            reviewedAt: updatedAt,
            reviewedById: REVIEWER_ID,
            reviewNote: 'Reviewed',
          }),
        ),
      );

      await expect(
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {
          reviewNote: 'Reviewed',
        }),
      ).resolves.toMatchObject({
        status: VerificationStatus.VERIFIED,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Reviewed',
      });

      const [sql, parameters] = dataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toMatch(
        /SET status = \$1,\s*reviewed_at = \$2,\s*reviewed_by_id = \$3,\s*review_note = \$4/,
      );
      expect(parameters.slice(0, 4)).toEqual([
        VerificationStatus.VERIFIED,
        expect.any(Date),
        REVIEWER_ID,
        'Reviewed',
      ]);
    });

    it('returns 409 when the compare-and-swap update affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      dataSource.query.mockResolvedValueOnce(updateResult());

      await expect(
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('maps the verified-per-year unique violation to 409', async () => {
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      const error = new QueryFailedError(
        'UPDATE population_records',
        [],
        pgError('23505', 'uq_population_records_verified_village_year'),
      );
      dataSource.query.mockRejectedValueOnce(error);

      await expect(
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates unrelated database errors without converting them to conflicts', async () => {
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      const error = new QueryFailedError(
        'UPDATE population_records',
        [],
        pgError('23505', 'uq_another_constraint'),
      );
      dataSource.query.mockRejectedValueOnce(error);

      await expect(
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {}),
      ).rejects.toBe(error);
    });

    it('does not update population value, source, or reference year', async () => {
      repository.findOneBy.mockResolvedValueOnce(populationRecord());
      dataSource.query.mockResolvedValueOnce(
        updateResult(populationRecord({ status: VerificationStatus.VERIFIED })),
      );

      await expect(
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {}),
      ).resolves.toMatchObject({
        status: VerificationStatus.VERIFIED,
      });

      const [sql] = dataSource.query.mock.calls[0] as [string, unknown[]];
      const setClause = sql.split('WHERE')[0];
      expect(setClause).not.toMatch(/\bvalue\s*=/);
      expect(setClause).not.toMatch(/\bsource_id\s*=/);
      expect(setClause).not.toMatch(/\breference_year\s*=/);
    });
  });

  describe('list', () => {
    it('checks village existence before querying and defaults to VERIFIED', async () => {
      await service.list(VILLAGE_ID, queryDto());

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(villages.ensureExists.mock.invocationCallOrder[0]).toBeLessThan(
        repository.createQueryBuilder.mock.invocationCallOrder[0],
      );
      expect(repository.createQueryBuilder).toHaveBeenCalledWith('record');
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'record.villageId = :villageId',
        { villageId: VILLAGE_ID },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'record.status = :status',
        { status: VerificationStatus.VERIFIED },
      );
    });

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'uses the explicitly requested %s status',
      async (status) => {
        await service.list(
          VILLAGE_ID,
          queryDto({ status }),
          userFor(Role.EDITOR),
        );

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'record.status = :status',
          { status },
        );
      },
    );

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'rejects anonymous requests for %s before querying',
      async (status) => {
        await expect(
          service.list(VILLAGE_ID, queryDto({ status })),
        ).rejects.toMatchObject({ status: 401 });
        expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'rejects VIEWER requests for %s before querying',
      async (status) => {
        await expect(
          service.list(VILLAGE_ID, queryDto({ status }), userFor(Role.VIEWER)),
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it.each([Role.EDITOR, Role.VERIFIER, Role.ADMIN])(
      'allows %s to explicitly list unverified records',
      async (role) => {
        await service.list(
          VILLAGE_ID,
          queryDto({ status: VerificationStatus.REJECTED }),
          userFor(role),
        );

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'record.status = :status',
          { status: VerificationStatus.REJECTED },
        );
      },
    );

    it('applies year and source filters with bound parameters', async () => {
      await service.list(
        VILLAGE_ID,
        queryDto({ year: 1997, sourceId: SOURCE_ID }),
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'record.referenceYear = :year',
        { year: 1997 },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'record.sourceId = :sourceId',
        { sourceId: SOURCE_ID },
      );
    });

    it('sorts by reference year ascending by default and adds an ID tie-breaker', async () => {
      await service.list(VILLAGE_ID, queryDto());

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'record.referenceYear',
        'ASC',
      );
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('record.id', 'ASC');
    });

    it('supports descending sort on a validated field', async () => {
      await service.list(
        VILLAGE_ID,
        queryDto({ sort: 'value', order: 'desc' }),
      );

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('record.value', 'DESC');
    });

    it('paginates and maps query results with the shared response shape', async () => {
      const record = populationRecord({
        village: { id: VILLAGE_ID },
        source: { id: SOURCE_ID },
      });
      queryBuilder.getManyAndCount.mockResolvedValue([[record], 5]);
      const query = queryDto({ page: 3, limit: 2 });

      const result = await service.list(VILLAGE_ID, query);

      expect(queryBuilder.skip).toHaveBeenCalledWith(4);
      expect(queryBuilder.take).toHaveBeenCalledWith(2);
      expect(queryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        data: [
          {
            id: RECORD_ID,
            villageId: VILLAGE_ID,
            sourceId: SOURCE_ID,
            value: 1200,
            referenceYear: 1997,
            status: VerificationStatus.PENDING,
            reviewedAt: null,
            reviewedById: null,
            reviewNote: null,
            createdAt,
            updatedAt,
          },
        ],
        meta: { page: 3, limit: 2, total: 5, totalPages: 3 },
      });
    });

    it('returns 404 for an unknown village without querying records', async () => {
      villages.ensureExists.mockRejectedValue(
        new NotFoundException(`Village ${VILLAGE_ID} not found`),
      );

      const error = await captureError(() =>
        service.list(VILLAGE_ID, queryDto()),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      if (error instanceof NotFoundException) {
        expect(error.getStatus()).toBe(404);
      }
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates allowed fields on a PENDING record and preserves other fields', async () => {
      const reviewDate = new Date('2025-02-01T00:00:00.000Z');
      const record = populationRecord({
        reviewedAt: reviewDate,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Existing review metadata',
      });
      repository.findOneBy.mockResolvedValue(record);

      const result = await service.update(
        VILLAGE_ID,
        RECORD_ID,
        Object.assign(new UpdatePopulationRecordDto(), { value: 1300 }),
      );

      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: RECORD_ID,
          villageId: VILLAGE_ID,
          value: 1300,
          referenceYear: 1997,
          sourceId: SOURCE_ID,
          status: VerificationStatus.PENDING,
          reviewedAt: reviewDate,
          reviewedById: REVIEWER_ID,
          reviewNote: 'Existing review metadata',
        }),
      );
      expect(result.value).toBe(1300);
      expect(result.referenceYear).toBe(1997);
      expect(result.sourceId).toBe(SOURCE_ID);
    });

    it('preserves fields whose DTO values are undefined', async () => {
      const record = populationRecord();
      repository.findOneBy.mockResolvedValue(record);
      const dto = Object.assign(new UpdatePopulationRecordDto(), {
        value: 1300,
        referenceYear: undefined,
        sourceId: undefined,
      });

      await service.update(VILLAGE_ID, RECORD_ID, dto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 1300,
          referenceYear: 1997,
          sourceId: SOURCE_ID,
        }),
      );
    });

    it('validates a supplied source ID and updates it', async () => {
      repository.findOneBy.mockResolvedValue(populationRecord());

      const result = await service.update(VILLAGE_ID, RECORD_ID, {
        sourceId: OTHER_SOURCE_ID,
      });

      expect(sources.ensureExists).toHaveBeenCalledWith(OTHER_SOURCE_ID);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: OTHER_SOURCE_ID }),
      );
      expect(result.sourceId).toBe(OTHER_SOURCE_ID);
    });

    it('does not check the source when sourceId is omitted', async () => {
      repository.findOneBy.mockResolvedValue(populationRecord());

      await service.update(VILLAGE_ID, RECORD_ID, { value: 1400 });

      expect(sources.ensureExists).not.toHaveBeenCalled();
    });

    it('does not save when the supplied source does not exist', async () => {
      repository.findOneBy.mockResolvedValue(populationRecord());
      sources.ensureExists.mockRejectedValue(
        new UnprocessableEntityException(
          `Source ${OTHER_SOURCE_ID} does not exist`,
        ),
      );

      const error = await captureError(() =>
        service.update(VILLAGE_ID, RECORD_ID, { sourceId: OTHER_SOURCE_ID }),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      if (error instanceof UnprocessableEntityException) {
        expect(error.getStatus()).toBe(422);
      }
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('does not save a future reference year and reports its validation field', async () => {
      repository.findOneBy.mockResolvedValue(populationRecord());

      const error = await captureError(() =>
        service.update(VILLAGE_ID, RECORD_ID, {
          referenceYear: new Date().getFullYear() + 1,
        }),
      );

      expect(error).toBeInstanceOf(ValidationException);
      if (error instanceof ValidationException) {
        expect(error.getStatus()).toBe(400);
        expect(error.fieldErrors).toContainEqual(
          expect.objectContaining({ field: 'referenceYear' }),
        );
      }
      expect(repository.save).not.toHaveBeenCalled();
    });

    it.each([VerificationStatus.VERIFIED, VerificationStatus.REJECTED])(
      'rejects updates to a %s record with 409',
      async (status) => {
        repository.findOneBy.mockResolvedValue(populationRecord({ status }));

        const error = await captureError(() =>
          service.update(VILLAGE_ID, RECORD_ID, { value: 1300 }),
        );

        expect(error).toBeInstanceOf(ConflictException);
        if (error instanceof ConflictException) {
          expect(error.getStatus()).toBe(409);
        }
        expect(repository.save).not.toHaveBeenCalled();
      },
    );

    it('does not apply client-supplied status or review metadata', async () => {
      const record = populationRecord();
      repository.findOneBy.mockResolvedValue(record);
      const dto = Object.assign(new UpdatePopulationRecordDto(), {
        value: 1300,
        id: OTHER_SOURCE_ID,
        villageId: OTHER_VILLAGE_ID,
        status: VerificationStatus.VERIFIED,
        reviewedAt: updatedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'forged',
      });

      await service.update(VILLAGE_ID, RECORD_ID, dto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: RECORD_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.PENDING,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: null,
          value: 1300,
        }),
      );
    });

    it('returns 404 and does not save when the record is missing', async () => {
      const error = await captureError(() =>
        service.update(VILLAGE_ID, RECORD_ID, { value: 1300 }),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      if (error instanceof NotFoundException) {
        expect(error.getStatus()).toBe(404);
      }
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('converts a duplicate update to 409', async () => {
      repository.findOneBy.mockResolvedValue(populationRecord());
      repository.save.mockRejectedValue(
        new QueryFailedError(
          'UPDATE population_records',
          [],
          pgError('23505', DUPLICATE_CONSTRAINT),
        ),
      );

      const error = await captureError(() =>
        service.update(VILLAGE_ID, RECORD_ID, { value: 1300 }),
      );

      expect(error).toBeInstanceOf(ConflictException);
      if (error instanceof ConflictException) {
        expect(error.getStatus()).toBe(409);
      }
    });
  });

  describe('remove', () => {
    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'deletes a %s record',
      async (status) => {
        const record = populationRecord({ status });
        repository.findOneBy.mockResolvedValue(record);

        await expect(
          service.remove(VILLAGE_ID, RECORD_ID),
        ).resolves.toBeUndefined();

        expect(repository.findOneBy).toHaveBeenCalledWith({
          id: RECORD_ID,
          villageId: VILLAGE_ID,
        });
        expect(repository.remove).toHaveBeenCalledWith(record);
      },
    );

    it('rejects deletion of a VERIFIED record with 409', async () => {
      repository.findOneBy.mockResolvedValue(
        populationRecord({ status: VerificationStatus.VERIFIED }),
      );

      const error = await captureError(() =>
        service.remove(VILLAGE_ID, RECORD_ID),
      );

      expect(error).toBeInstanceOf(ConflictException);
      if (error instanceof ConflictException) {
        expect(error.getStatus()).toBe(409);
      }
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('returns 404 when the record is missing', async () => {
      const error = await captureError(() =>
        service.remove(VILLAGE_ID, RECORD_ID),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      if (error instanceof NotFoundException) {
        expect(error.getStatus()).toBe(404);
      }
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
