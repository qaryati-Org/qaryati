import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { ValidationException } from '../../common/errors/validation.exception';
import type { AuthenticatedUser } from '../auth';
import { Role } from '../auth';
import { SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreateHistoryRecordDto } from './dto/create-history-record.dto';
import { HistoryRecordQueryDto } from './dto/history-record-query.dto';
import { HistoryRecordSourceData } from './dto/history-record-response.dto';
import { UpdateHistoryRecordDto } from './dto/update-history-record.dto';
import {
  HistoryRecord,
  HistoryRecordType,
} from './entities/history-record.entity';
import { HistoryReviewerContext, HistoryService } from './history.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VILLAGE_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_SOURCE_ID = '00000000-0000-4000-8000-000000000004';
const RECORD_ID = '00000000-0000-4000-8000-000000000005';
const REVIEWER_ID = '00000000-0000-4000-8000-000000000006';
const OVERVIEW_CONSTRAINT = 'uq_history_records_village_overview';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

const user = (role: Role): AuthenticatedUser => ({
  id: REVIEWER_ID,
  email: 'reviewer@example.test',
  role,
});

const historyRecord = (
  overrides: Partial<HistoryRecord> = {},
): HistoryRecord => ({
  id: RECORD_ID,
  villageId: VILLAGE_ID,
  sourceId: SOURCE_ID,
  type: HistoryRecordType.EVENT,
  title: 'The village in 1948',
  description: 'Historical description',
  startYear: 1948,
  endYear: 1949,
  status: VerificationStatus.PENDING,
  reviewedAt: null,
  reviewedById: null,
  reviewNote: null,
  createdAt,
  updatedAt,
  ...overrides,
});

const source = (
  id = SOURCE_ID,
  title = 'Historical source',
): HistoryRecordSourceData => ({
  id,
  title,
  type: 'BOOK',
  author: 'Researcher',
  url: `https://example.test/${id}`,
  year: 2000,
});

const createDto = (
  overrides: Partial<CreateHistoryRecordDto> = {},
): CreateHistoryRecordDto =>
  Object.assign(new CreateHistoryRecordDto(), {
    type: HistoryRecordType.EVENT,
    title: 'The village in 1948',
    description: 'Historical description',
    sourceId: SOURCE_ID,
    startYear: 1948,
    endYear: 1949,
    ...overrides,
  });

const queryDto = (
  overrides: Partial<HistoryRecordQueryDto> = {},
): HistoryRecordQueryDto =>
  Object.assign(new HistoryRecordQueryDto(), overrides);

function pgError(code: string, constraint?: string): QueryFailedError {
  const driverError = Object.assign(new Error(`database error ${code}`), {
    code,
    constraint,
  });
  return new QueryFailedError('history_records write', [], driverError);
}

describe('HistoryService', () => {
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
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
  let service: HistoryService;

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
    for (const method of [
      queryBuilder.where,
      queryBuilder.andWhere,
      queryBuilder.orderBy,
      queryBuilder.addOrderBy,
      queryBuilder.skip,
      queryBuilder.take,
    ]) {
      method.mockReturnValue(queryBuilder);
    }

    repository = {
      create: jest.fn((fields: Partial<HistoryRecord>) =>
        historyRecord(fields),
      ),
      save: jest.fn((record: HistoryRecord) => Promise.resolve(record)),
      findOneBy: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    villages = { ensureExists: jest.fn().mockResolvedValue(undefined) };
    sources = {
      ensureExists: jest.fn().mockResolvedValue(undefined),
      findByIds: jest.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => source(id, `Source ${id}`))),
      ),
    };

    service = new HistoryService(
      repository as unknown as Repository<HistoryRecord>,
      villages as unknown as VillageService,
      sources as unknown as SourceService,
    );
  });

  describe('create', () => {
    it('creates a PENDING record with null review metadata', async () => {
      const result = await service.create(VILLAGE_ID, createDto());

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(sources.ensureExists).toHaveBeenCalledWith(SOURCE_ID);
      expect(repository.create).toHaveBeenCalledWith({
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        type: HistoryRecordType.EVENT,
        title: 'The village in 1948',
        description: 'Historical description',
        startYear: 1948,
        endYear: 1949,
        status: VerificationStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
      });
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        status: VerificationStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        source: { id: SOURCE_ID },
      });
    });

    it('returns 404 for an unknown village without saving', async () => {
      villages.ensureExists.mockRejectedValueOnce(
        new NotFoundException('Village not found'),
      );

      await expect(
        service.create(VILLAGE_ID, createDto()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.save).not.toHaveBeenCalled();
      expect(sources.ensureExists).not.toHaveBeenCalled();
    });

    it('returns 422 for an unknown source without saving', async () => {
      sources.ensureExists.mockRejectedValueOnce(
        new UnprocessableEntityException('Source does not exist'),
      );

      await expect(
        service.create(VILLAGE_ID, createDto()),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('maps the overview unique constraint to 409', async () => {
      repository.save.mockRejectedValueOnce(
        pgError('23505', OVERVIEW_CONSTRAINT),
      );

      await expect(
        service.create(
          VILLAGE_ID,
          createDto({ type: HistoryRecordType.OVERVIEW }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows multiple EVENT records for the same village', async () => {
      await service.create(VILLAGE_ID, createDto());
      await service.create(VILLAGE_ID, createDto({ title: 'Another event' }));

      expect(repository.save).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['positive CE years', 1948, 1949],
      ['negative BCE years', -100, -50],
      ['a BCE-to-CE range', -1, 1],
    ])('accepts %s', async (_label, startYear, endYear) => {
      await expect(
        service.create(VILLAGE_ID, createDto({ startYear, endYear })),
      ).resolves.toMatchObject({ startYear, endYear });
    });

    it.each([
      ['startYear zero', { startYear: 0 }, 'startYear'],
      ['endYear zero', { endYear: 0 }, 'endYear'],
      ['startYear above 2100', { startYear: 2101 }, 'startYear'],
      ['endYear above 2100', { endYear: 2101 }, 'endYear'],
      [
        'endYear without startYear',
        { startYear: null, endYear: 10 },
        'endYear',
      ],
      ['endYear before startYear', { startYear: 10, endYear: 9 }, 'endYear'],
    ])('rejects %s', async (_label, years, field) => {
      await expect(
        service.create(
          VILLAGE_ID,
          createDto(years as Partial<CreateHistoryRecordDto>),
        ),
      ).rejects.toMatchObject({
        constructor: ValidationException,
        fieldErrors: expect.arrayContaining([
          expect.objectContaining({ field }),
        ]),
      });
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('filters to VERIFIED records and returns mapped source provenance', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [historyRecord({ status: VerificationStatus.VERIFIED })],
        1,
      ]);

      const result = await service.list(VILLAGE_ID, queryDto());

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'record.status = :status',
        { status: VerificationStatus.VERIFIED },
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        status: VerificationStatus.VERIFIED,
        source: { id: SOURCE_ID, title: `Source ${SOURCE_ID}` },
      });
    });

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'requires authentication to list %s records',
      async (status) => {
        await expect(
          service.list(VILLAGE_ID, queryDto({ status })),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'denies VIEWER access to %s records',
      async (status) => {
        await expect(
          service.list(VILLAGE_ID, queryDto({ status }), user(Role.VIEWER)),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(repository.createQueryBuilder).not.toHaveBeenCalled();
      },
    );

    it.each([Role.EDITOR, Role.VERIFIER, Role.ADMIN])(
      'allows %s to list unverified records',
      async (role) => {
        const query = queryDto({
          status: VerificationStatus.PENDING,
          type: HistoryRecordType.EVENT,
        });

        await service.list(VILLAGE_ID, query, user(role));

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'record.status = :status',
          { status: VerificationStatus.PENDING },
        );
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'record.type = :type',
          { type: HistoryRecordType.EVENT },
        );
      },
    );

    it('allows VERIFIED records without authentication', async () => {
      await service.list(
        VILLAGE_ID,
        queryDto({ status: VerificationStatus.VERIFIED }),
      );

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'record.status = :status',
        { status: VerificationStatus.VERIFIED },
      );
    });

    it.each([HistoryRecordType.OVERVIEW, HistoryRecordType.EVENT])(
      'filters by type %s',
      async (type) => {
        await service.list(VILLAGE_ID, queryDto({ type }));

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'record.type = :type',
          { type },
        );
      },
    );

    it('sorts chronologically with NULLS FIRST and ID tie-breaker', async () => {
      await service.list(VILLAGE_ID, queryDto());

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'record.startYear',
        'ASC',
        'NULLS FIRST',
      );
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('record.id', 'ASC');
    });

    it('applies pagination and returns total-count metadata', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [historyRecord({ status: VerificationStatus.VERIFIED })],
        5,
      ]);
      const query = queryDto({ page: 2, limit: 1 });

      const result = await service.list(VILLAGE_ID, query);

      expect(queryBuilder.skip).toHaveBeenCalledWith(1);
      expect(queryBuilder.take).toHaveBeenCalledWith(1);
      expect(result.meta).toEqual({
        page: 2,
        limit: 1,
        total: 5,
        totalPages: 5,
      });
    });

    it('uses one bulk source lookup for the page, not one lookup per record', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [
          historyRecord({ id: RECORD_ID, status: VerificationStatus.VERIFIED }),
          historyRecord({
            id: REVIEWER_ID,
            sourceId: OTHER_SOURCE_ID,
            status: VerificationStatus.VERIFIED,
          }),
        ],
        2,
      ]);

      await service.list(VILLAGE_ID, queryDto());

      expect(sources.findByIds).toHaveBeenCalledTimes(1);
      expect(sources.findByIds).toHaveBeenCalledWith([
        SOURCE_ID,
        OTHER_SOURCE_ID,
      ]);
    });

    it('throws an internal server error if a listed source is missing', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [historyRecord({ status: VerificationStatus.VERIFIED })],
        1,
      ]);
      sources.findByIds.mockResolvedValueOnce([]);

      await expect(service.list(VILLAGE_ID, queryDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe('findOne', () => {
    it('returns a VERIFIED record with source provenance', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        historyRecord({ status: VerificationStatus.VERIFIED }),
      );

      const result = await service.findOne(VILLAGE_ID, RECORD_ID);

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
        status: VerificationStatus.VERIFIED,
      });
      expect(result).toMatchObject({
        id: RECORD_ID,
        status: VerificationStatus.VERIFIED,
        source: { id: SOURCE_ID, title: `Source ${SOURCE_ID}` },
      });
    });

    it('returns 404 when the record does not exist', async () => {
      await expect(
        service.findOne(VILLAGE_ID, RECORD_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 when the record belongs to another village', async () => {
      repository.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.findOne(VILLAGE_ID, RECORD_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: VILLAGE_ID,
        status: VerificationStatus.VERIFIED,
      });
    });

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'returns 404 for a %s record',
      async (status) => {
        const unverifiedRecord = historyRecord({ status });
        repository.findOneBy.mockImplementationOnce(
          (criteria: Partial<HistoryRecord>) =>
            Promise.resolve(
              unverifiedRecord.id === criteria.id &&
                unverifiedRecord.villageId === criteria.villageId &&
                unverifiedRecord.status === criteria.status
                ? unverifiedRecord
                : null,
            ),
        );

        await expect(
          service.findOne(VILLAGE_ID, RECORD_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(repository.findOneBy).toHaveBeenCalledWith({
          id: RECORD_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.VERIFIED,
        });
      },
    );

    it('preserves village-not-found behavior', async () => {
      villages.ensureExists.mockRejectedValueOnce(
        new NotFoundException('Village not found'),
      );

      await expect(service.findOne(VILLAGE_ID, RECORD_ID)).rejects.toThrow(
        'Village not found',
      );
      expect(repository.findOneBy).not.toHaveBeenCalled();
    });

    it('preserves the unavailable-source error', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        historyRecord({ status: VerificationStatus.VERIFIED }),
      );
      sources.findByIds.mockResolvedValueOnce([]);

      await expect(
        service.findOne(VILLAGE_ID, RECORD_ID),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('update', () => {
    it('updates only supplied editable fields with a PENDING condition', async () => {
      const initial = historyRecord({
        reviewedAt: updatedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Existing metadata',
      });
      const updated = historyRecord({
        ...initial,
        title: 'Updated title',
      });
      repository.findOneBy
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(updated);

      await service.update(
        VILLAGE_ID,
        RECORD_ID,
        Object.assign(new UpdateHistoryRecordDto(), { title: 'Updated title' }),
      );

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: RECORD_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.PENDING,
        },
        { title: 'Updated title' },
      );
      expect(repository.update.mock.calls[0][1]).not.toHaveProperty('status');
      expect(repository.update.mock.calls[0][1]).not.toHaveProperty(
        'reviewedAt',
      );
      expect(repository.update.mock.calls[0][1]).not.toHaveProperty(
        'reviewedById',
      );
      expect(repository.update.mock.calls[0][1]).not.toHaveProperty(
        'reviewNote',
      );
    });

    it.each([VerificationStatus.VERIFIED, VerificationStatus.REJECTED])(
      'rejects editing a %s record',
      async (status) => {
        repository.findOneBy.mockResolvedValueOnce(historyRecord({ status }));

        await expect(
          service.update(
            VILLAGE_ID,
            RECORD_ID,
            Object.assign(new UpdateHistoryRecordDto(), { title: 'New title' }),
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('returns 404 when the record is missing or belongs to another village', async () => {
      await expect(
        service.update(
          OTHER_VILLAGE_ID,
          RECORD_ID,
          Object.assign(new UpdateHistoryRecordDto(), { title: 'New title' }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: OTHER_VILLAGE_ID,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('validates changed sources and applies a valid source change', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(historyRecord())
        .mockResolvedValueOnce(historyRecord({ sourceId: OTHER_SOURCE_ID }));

      await service.update(
        VILLAGE_ID,
        RECORD_ID,
        Object.assign(new UpdateHistoryRecordDto(), {
          sourceId: OTHER_SOURCE_ID,
        }),
      );

      expect(sources.ensureExists).toHaveBeenCalledWith(OTHER_SOURCE_ID);
      expect(repository.update).toHaveBeenCalledWith(expect.any(Object), {
        sourceId: OTHER_SOURCE_ID,
      });
    });

    it('does not update when the changed source does not exist', async () => {
      repository.findOneBy.mockResolvedValueOnce(historyRecord());
      sources.ensureExists.mockRejectedValueOnce(
        new UnprocessableEntityException('Source does not exist'),
      );

      await expect(
        service.update(
          VILLAGE_ID,
          RECORD_ID,
          Object.assign(new UpdateHistoryRecordDto(), {
            sourceId: OTHER_SOURCE_ID,
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('supports clearing both years with null', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(historyRecord())
        .mockResolvedValueOnce(
          historyRecord({ startYear: null, endYear: null }),
        );

      await service.update(
        VILLAGE_ID,
        RECORD_ID,
        Object.assign(new UpdateHistoryRecordDto(), {
          startYear: null,
          endYear: null,
        }),
      );

      expect(repository.update).toHaveBeenCalledWith(expect.any(Object), {
        startYear: null,
        endYear: null,
      });
    });

    it('rejects clearing startYear while endYear remains set', async () => {
      repository.findOneBy.mockResolvedValueOnce(historyRecord());

      await expect(
        service.update(
          VILLAGE_ID,
          RECORD_ID,
          Object.assign(new UpdateHistoryRecordDto(), { startYear: null }),
        ),
      ).rejects.toBeInstanceOf(ValidationException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when the conditional update affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(historyRecord());
      repository.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.update(
          VILLAGE_ID,
          RECORD_ID,
          Object.assign(new UpdateHistoryRecordDto(), { title: 'New title' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'deletes a %s record with an allowed-status condition',
      async (status) => {
        repository.findOneBy.mockResolvedValueOnce(historyRecord({ status }));

        await service.remove(VILLAGE_ID, RECORD_ID);

        const [criteria] = repository.delete.mock.calls[0] as [
          {
            id: string;
            villageId: string;
            status: { type: string; value: string[] };
          },
        ];
        expect(criteria.id).toBe(RECORD_ID);
        expect(criteria.villageId).toBe(VILLAGE_ID);
        expect(criteria.status.type).toBe('in');
        expect(criteria.status.value).toEqual([
          VerificationStatus.PENDING,
          VerificationStatus.REJECTED,
        ]);
      },
    );

    it('does not delete a VERIFIED record', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        historyRecord({ status: VerificationStatus.VERIFIED }),
      );

      await expect(
        service.remove(VILLAGE_ID, RECORD_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown record', async () => {
      await expect(
        service.remove(VILLAGE_ID, RECORD_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('returns 409 when the conditional delete affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(historyRecord());
      repository.delete.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.remove(VILLAGE_ID, RECORD_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('verification and rejection', () => {
    const reviewer: HistoryReviewerContext = { reviewerId: REVIEWER_ID };

    it('transitions PENDING to VERIFIED and atomically stores review metadata', async () => {
      const reviewedAt = new Date('2026-03-01T12:00:00.000Z');
      const initial = historyRecord();
      const updated = historyRecord({
        status: VerificationStatus.VERIFIED,
        reviewedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Evidence confirmed',
      });
      repository.findOneBy
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(updated);

      const result = await service.verify(VILLAGE_ID, RECORD_ID, reviewer, {
        reviewNote: 'Evidence confirmed',
      });

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: RECORD_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.PENDING,
        },
        {
          status: VerificationStatus.VERIFIED,
          reviewedAt: expect.any(Date),
          reviewedById: REVIEWER_ID,
          reviewNote: 'Evidence confirmed',
        },
      );
      expect(result).toMatchObject({
        status: VerificationStatus.VERIFIED,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Evidence confirmed',
        source: { id: SOURCE_ID },
      });
    });

    it('transitions PENDING to REJECTED and stores the required note', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(historyRecord())
        .mockResolvedValueOnce(
          historyRecord({
            status: VerificationStatus.REJECTED,
            reviewedById: REVIEWER_ID,
            reviewNote: 'Insufficient evidence',
          }),
        );

      await service.reject(VILLAGE_ID, RECORD_ID, reviewer, {
        reviewNote: 'Insufficient evidence',
      });

      expect(repository.update.mock.calls[0][1]).toMatchObject({
        status: VerificationStatus.REJECTED,
        reviewedAt: expect.any(Date),
        reviewedById: REVIEWER_ID,
        reviewNote: 'Insufficient evidence',
      });
    });

    it('transitions VERIFIED to REJECTED', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(
          historyRecord({ status: VerificationStatus.VERIFIED }),
        )
        .mockResolvedValueOnce(
          historyRecord({ status: VerificationStatus.REJECTED }),
        );

      await expect(
        service.reject(VILLAGE_ID, RECORD_ID, reviewer, {
          reviewNote: 'Later evidence disproved it',
        }),
      ).resolves.toMatchObject({ status: VerificationStatus.REJECTED });
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: VerificationStatus.VERIFIED }),
        expect.objectContaining({ status: VerificationStatus.REJECTED }),
      );
    });

    it.each([
      [VerificationStatus.REJECTED, 'verify'],
      [VerificationStatus.REJECTED, 'reject'],
      [VerificationStatus.VERIFIED, 'verify'],
    ] as const)(
      'rejects invalid %s -> %s transition',
      async (status, action) => {
        repository.findOneBy.mockResolvedValueOnce(historyRecord({ status }));
        const operation =
          action === 'verify'
            ? service.verify(VILLAGE_ID, RECORD_ID, reviewer, {})
            : service.reject(VILLAGE_ID, RECORD_ID, reviewer, {
                reviewNote: 'Repeated rejection',
              });

        await expect(operation).rejects.toBeInstanceOf(ConflictException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for an unknown or wrong-village record', async () => {
      await expect(
        service.verify(OTHER_VILLAGE_ID, RECORD_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
        villageId: OTHER_VILLAGE_ID,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when the conditional review update affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(historyRecord());
      repository.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.verify(VILLAGE_ID, RECORD_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not include historical content in the review update', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(historyRecord())
        .mockResolvedValueOnce(
          historyRecord({ status: VerificationStatus.VERIFIED }),
        );

      await service.verify(VILLAGE_ID, RECORD_ID, reviewer, {
        reviewNote: 'Reviewed',
      });

      expect(repository.update.mock.calls[0][1]).toEqual({
        status: VerificationStatus.VERIFIED,
        reviewedAt: expect.any(Date),
        reviewedById: REVIEWER_ID,
        reviewNote: 'Reviewed',
      });
    });
  });
});
