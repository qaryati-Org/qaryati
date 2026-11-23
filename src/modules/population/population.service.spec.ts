import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { ValidationException } from '../../common/errors/validation.exception';
import { SourceService } from '../source/source.service';
import { VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreatePopulationRecordDto } from './dto/create-population-record.dto';
import { PopulationRecordQueryDto } from './dto/population-record-query.dto';
import { UpdatePopulationRecordDto } from './dto/update-population-record.dto';
import { PopulationRecord } from './entities/population-record.entity';
import { PopulationService } from './population.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VILLAGE_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_SOURCE_ID = '00000000-0000-4000-8000-000000000004';
const RECORD_ID = '00000000-0000-4000-8000-000000000005';
const REVIEWER_ID = '00000000-0000-4000-8000-000000000006';
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
  let villages: { findOne: jest.Mock };
  let sources: { ensureExists: jest.Mock };
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
    villages = { findOne: jest.fn().mockResolvedValue({ id: VILLAGE_ID }) };
    sources = { ensureExists: jest.fn().mockResolvedValue(undefined) };

    service = new PopulationService(
      repository as unknown as Repository<PopulationRecord>,
      villages as unknown as VillageService,
      sources as unknown as SourceService,
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

      expect(villages.findOne).toHaveBeenCalledWith(VILLAGE_ID);
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
      villages.findOne.mockRejectedValue(
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
    it('searches by both record ID and village ID and maps the record', async () => {
      const record = populationRecord({
        village: { id: VILLAGE_ID },
        source: { id: SOURCE_ID },
        reviewedBy: { id: REVIEWER_ID },
      });
      repository.findOneBy.mockResolvedValue(record);

      const result = await service.findOne(VILLAGE_ID, RECORD_ID);

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
  });

  describe('list', () => {
    it('checks village existence before querying and defaults to VERIFIED', async () => {
      await service.list(VILLAGE_ID, queryDto());

      expect(villages.findOne).toHaveBeenCalledWith(VILLAGE_ID);
      expect(villages.findOne.mock.invocationCallOrder[0]).toBeLessThan(
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
        await service.list(VILLAGE_ID, queryDto({ status }));

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'record.status = :status',
          { status },
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
      villages.findOne.mockRejectedValue(
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
