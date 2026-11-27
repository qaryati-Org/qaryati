import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreateLandmarkDto } from './dto/create-landmark.dto';
import { LandmarkQueryDto } from './dto/landmark-query.dto';
import { LandmarkSourceData } from './dto/landmark-response.dto';
import { UpdateLandmarkDto } from './dto/update-landmark.dto';
import { Landmark, LandmarkType } from './entities/landmark.entity';
import { LandmarkReviewerContext, LandmarkService } from './landmark.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VILLAGE_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_SOURCE_ID = '00000000-0000-4000-8000-000000000004';
const LANDMARK_ID = '00000000-0000-4000-8000-000000000005';
const REVIEWER_ID = '00000000-0000-4000-8000-000000000006';
const SOURCE_FOREIGN_KEY = 'landmarks_source_id_fkey';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

const landmark = (overrides: Partial<Landmark> = {}): Landmark => ({
  id: LANDMARK_ID,
  villageId: VILLAGE_ID,
  sourceId: SOURCE_ID,
  name: 'Village spring',
  type: LandmarkType.SPRING,
  description: 'A historical spring',
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
  title = `Source ${id}`,
): LandmarkSourceData => ({
  id,
  title,
  type: 'BOOK',
  author: 'Researcher',
  url: `https://example.test/${id}`,
  year: 2000,
});

const createDto = (
  overrides: Partial<CreateLandmarkDto> = {},
): CreateLandmarkDto =>
  Object.assign(new CreateLandmarkDto(), {
    name: 'Village spring',
    type: LandmarkType.SPRING,
    description: 'A historical spring',
    sourceId: SOURCE_ID,
    ...overrides,
  });

const queryDto = (
  overrides: Partial<LandmarkQueryDto> = {},
): LandmarkQueryDto => Object.assign(new LandmarkQueryDto(), overrides);

function pgError(code: string, constraint?: string): QueryFailedError {
  const driverError = Object.assign(new Error(`database error ${code}`), {
    code,
    constraint,
  });
  return new QueryFailedError('landmarks write', [], driverError);
}

describe('LandmarkService', () => {
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
  let service: LandmarkService;

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
      create: jest.fn((fields: Partial<Landmark>) => landmark(fields)),
      save: jest.fn((record: Landmark) => Promise.resolve(record)),
      findOneBy: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    villages = { ensureExists: jest.fn().mockResolvedValue(undefined) };
    sources = {
      ensureExists: jest.fn().mockResolvedValue(undefined),
      findByIds: jest.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => source(id))),
      ),
    };
    service = new LandmarkService(
      repository as unknown as Repository<Landmark>,
      villages as unknown as VillageService,
      sources as unknown as SourceService,
    );
  });

  describe('create', () => {
    it('creates a PENDING landmark with null review metadata and source provenance', async () => {
      const result = await service.create(VILLAGE_ID, createDto());

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(sources.ensureExists).toHaveBeenCalledWith(SOURCE_ID);
      expect(repository.create).toHaveBeenCalledWith({
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        name: 'Village spring',
        type: LandmarkType.SPRING,
        description: 'A historical spring',
        status: VerificationStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
      });
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        status: VerificationStatus.PENDING,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        source: { id: SOURCE_ID, title: `Source ${SOURCE_ID}` },
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

    it('maps a source foreign-key race to 422', async () => {
      repository.save.mockRejectedValueOnce(
        pgError('23503', SOURCE_FOREIGN_KEY),
      );

      await expect(
        service.create(VILLAGE_ID, createDto()),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('allows multiple landmarks of the same type in a village', async () => {
      await service.create(VILLAGE_ID, createDto());
      await service.create(VILLAGE_ID, createDto({ name: 'Another spring' }));

      expect(repository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('list', () => {
    it('filters to VERIFIED landmarks and maps source provenance', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [landmark({ status: VerificationStatus.VERIFIED })],
        1,
      ]);

      const result = await service.list(VILLAGE_ID, queryDto());

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'landmark.status = :status',
        { status: VerificationStatus.VERIFIED },
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        status: VerificationStatus.VERIFIED,
        source: { id: SOURCE_ID, title: `Source ${SOURCE_ID}` },
      });
    });

    it.each(Object.values(LandmarkType))(
      'filters by landmark type %s',
      async (type) => {
        await service.list(VILLAGE_ID, queryDto({ type }));

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'landmark.type = :type',
          { type },
        );
      },
    );

    it('sorts by name ascending and then ID ascending', async () => {
      await service.list(VILLAGE_ID, queryDto());

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('landmark.name', 'ASC');
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
        'landmark.id',
        'ASC',
      );
    });

    it('applies pagination and returns total-count metadata', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [landmark({ status: VerificationStatus.VERIFIED })],
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

    it('loads sources in one bulk lookup for the returned page', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [
          landmark({
            id: LANDMARK_ID,
            status: VerificationStatus.VERIFIED,
          }),
          landmark({
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
        [landmark({ status: VerificationStatus.VERIFIED })],
        1,
      ]);
      sources.findByIds.mockResolvedValueOnce([]);

      await expect(service.list(VILLAGE_ID, queryDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('returns 404 for an unknown village', async () => {
      villages.ensureExists.mockRejectedValueOnce(
        new NotFoundException('Village not found'),
      );

      await expect(service.list(VILLAGE_ID, queryDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns a VERIFIED landmark with source provenance', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        landmark({ status: VerificationStatus.VERIFIED }),
      );

      const result = await service.findOne(VILLAGE_ID, LANDMARK_ID);

      expect(villages.ensureExists).toHaveBeenCalledWith(VILLAGE_ID);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: LANDMARK_ID,
        villageId: VILLAGE_ID,
        status: VerificationStatus.VERIFIED,
      });
      expect(result).toMatchObject({
        id: LANDMARK_ID,
        status: VerificationStatus.VERIFIED,
        source: { id: SOURCE_ID, title: `Source ${SOURCE_ID}` },
      });
    });

    it('returns 404 when the landmark does not exist', async () => {
      await expect(
        service.findOne(VILLAGE_ID, LANDMARK_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 when the landmark belongs to another village', async () => {
      repository.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.findOne(VILLAGE_ID, LANDMARK_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: LANDMARK_ID,
        villageId: VILLAGE_ID,
        status: VerificationStatus.VERIFIED,
      });
    });

    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'returns 404 for a %s landmark',
      async (status) => {
        const unverifiedLandmark = landmark({ status });
        repository.findOneBy.mockImplementationOnce(
          (criteria: Partial<Landmark>) =>
            Promise.resolve(
              unverifiedLandmark.id === criteria.id &&
                unverifiedLandmark.villageId === criteria.villageId &&
                unverifiedLandmark.status === criteria.status
                ? unverifiedLandmark
                : null,
            ),
        );

        await expect(
          service.findOne(VILLAGE_ID, LANDMARK_ID),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(repository.findOneBy).toHaveBeenCalledWith({
          id: LANDMARK_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.VERIFIED,
        });
      },
    );

    it('preserves village-not-found behavior', async () => {
      villages.ensureExists.mockRejectedValueOnce(
        new NotFoundException('Village not found'),
      );

      await expect(service.findOne(VILLAGE_ID, LANDMARK_ID)).rejects.toThrow(
        'Village not found',
      );
      expect(repository.findOneBy).not.toHaveBeenCalled();
    });

    it('preserves the unavailable-source error', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        landmark({ status: VerificationStatus.VERIFIED }),
      );
      sources.findByIds.mockResolvedValueOnce([]);

      await expect(
        service.findOne(VILLAGE_ID, LANDMARK_ID),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('update', () => {
    it('updates only supplied fields for a PENDING landmark without changing review metadata', async () => {
      const original = landmark({
        reviewedAt: updatedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Existing metadata',
      });
      repository.findOneBy
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(
          landmark({ ...original, name: 'Updated spring' }),
        );

      const result = await service.update(
        VILLAGE_ID,
        LANDMARK_ID,
        Object.assign(new UpdateLandmarkDto(), { name: 'Updated spring' }),
      );

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: LANDMARK_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.PENDING,
        },
        { name: 'Updated spring' },
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
      expect(result.name).toBe('Updated spring');
    });

    it.each([VerificationStatus.VERIFIED, VerificationStatus.REJECTED])(
      'rejects editing a %s landmark',
      async (status) => {
        repository.findOneBy.mockResolvedValueOnce(landmark({ status }));

        await expect(
          service.update(
            VILLAGE_ID,
            LANDMARK_ID,
            Object.assign(new UpdateLandmarkDto(), { name: 'Changed' }),
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('returns 404 when the landmark is unknown or belongs to another village', async () => {
      await expect(
        service.update(
          OTHER_VILLAGE_ID,
          LANDMARK_ID,
          Object.assign(new UpdateLandmarkDto(), { name: 'Changed' }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: LANDMARK_ID,
        villageId: OTHER_VILLAGE_ID,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('validates changed sources and maps source foreign-key races', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(landmark())
        .mockResolvedValueOnce(landmark({ sourceId: OTHER_SOURCE_ID }));

      await service.update(
        VILLAGE_ID,
        LANDMARK_ID,
        Object.assign(new UpdateLandmarkDto(), {
          sourceId: OTHER_SOURCE_ID,
        }),
      );

      expect(sources.ensureExists).toHaveBeenCalledWith(OTHER_SOURCE_ID);
      expect(repository.update).toHaveBeenCalledWith(expect.any(Object), {
        sourceId: OTHER_SOURCE_ID,
      });

      repository.findOneBy.mockResolvedValueOnce(landmark());
      repository.update.mockRejectedValueOnce(
        pgError('23503', SOURCE_FOREIGN_KEY),
      );
      await expect(
        service.update(
          VILLAGE_ID,
          LANDMARK_ID,
          Object.assign(new UpdateLandmarkDto(), {
            sourceId: OTHER_SOURCE_ID,
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('returns 409 when the conditional update affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(landmark());
      repository.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.update(
          VILLAGE_ID,
          LANDMARK_ID,
          Object.assign(new UpdateLandmarkDto(), { name: 'Changed' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'deletes a %s landmark only when ID, village, and status match',
      async (status) => {
        repository.findOneBy.mockResolvedValueOnce(landmark({ status }));

        await service.remove(VILLAGE_ID, LANDMARK_ID);

        const [criteria] = repository.delete.mock.calls[0] as [
          {
            id: string;
            villageId: string;
            status: { type: string; value: VerificationStatus[] };
          },
        ];
        expect(criteria.id).toBe(LANDMARK_ID);
        expect(criteria.villageId).toBe(VILLAGE_ID);
        expect(criteria.status.type).toBe('in');
        expect(criteria.status.value).toEqual([
          VerificationStatus.PENDING,
          VerificationStatus.REJECTED,
        ]);
      },
    );

    it('does not delete a VERIFIED landmark', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        landmark({ status: VerificationStatus.VERIFIED }),
      );

      await expect(
        service.remove(VILLAGE_ID, LANDMARK_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown landmark', async () => {
      await expect(
        service.remove(VILLAGE_ID, LANDMARK_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('returns 409 when the conditional delete affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(landmark());
      repository.delete.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.remove(VILLAGE_ID, LANDMARK_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('verification and rejection', () => {
    const reviewer: LandmarkReviewerContext = { reviewerId: REVIEWER_ID };

    it('transitions PENDING to VERIFIED and atomically stores review metadata', async () => {
      const verified = landmark({
        status: VerificationStatus.VERIFIED,
        reviewedAt: updatedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Evidence confirmed',
      });
      repository.findOneBy
        .mockResolvedValueOnce(landmark())
        .mockResolvedValueOnce(verified);

      const result = await service.verify(VILLAGE_ID, LANDMARK_ID, reviewer, {
        reviewNote: 'Evidence confirmed',
      });

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: LANDMARK_ID,
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

    it('transitions PENDING to REJECTED and stores the trusted reviewer and note', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(landmark())
        .mockResolvedValueOnce(
          landmark({
            status: VerificationStatus.REJECTED,
            reviewedById: REVIEWER_ID,
            reviewNote: 'Insufficient evidence',
          }),
        );

      await service.reject(VILLAGE_ID, LANDMARK_ID, reviewer, {
        reviewNote: 'Insufficient evidence',
      });

      expect(repository.update.mock.calls[0][1]).toMatchObject({
        status: VerificationStatus.REJECTED,
        reviewedAt: expect.any(Date),
        reviewedById: REVIEWER_ID,
        reviewNote: 'Insufficient evidence',
      });
    });

    it('transitions VERIFIED to REJECTED using the previously read status', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(
          landmark({ status: VerificationStatus.VERIFIED }),
        )
        .mockResolvedValueOnce(
          landmark({ status: VerificationStatus.REJECTED }),
        );

      await service.reject(VILLAGE_ID, LANDMARK_ID, reviewer, {
        reviewNote: 'Later evidence disproved it',
      });

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: LANDMARK_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.VERIFIED,
        },
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
        repository.findOneBy.mockResolvedValueOnce(landmark({ status }));
        const result =
          action === 'verify'
            ? service.verify(VILLAGE_ID, LANDMARK_ID, reviewer, {})
            : service.reject(VILLAGE_ID, LANDMARK_ID, reviewer, {
                reviewNote: 'Repeated rejection',
              });

        await expect(result).rejects.toBeInstanceOf(ConflictException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('does not include landmark content in a review update', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(landmark())
        .mockResolvedValueOnce(
          landmark({ status: VerificationStatus.VERIFIED }),
        );

      await service.verify(VILLAGE_ID, LANDMARK_ID, reviewer, {
        reviewNote: 'Reviewed',
      });

      expect(repository.update.mock.calls[0][1]).toEqual({
        status: VerificationStatus.VERIFIED,
        reviewedAt: expect.any(Date),
        reviewedById: REVIEWER_ID,
        reviewNote: 'Reviewed',
      });
    });

    it('returns 404 for an unknown or wrong-village landmark', async () => {
      await expect(
        service.verify(OTHER_VILLAGE_ID, LANDMARK_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: LANDMARK_ID,
        villageId: OTHER_VILLAGE_ID,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when the conditional review update affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(landmark());
      repository.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.verify(VILLAGE_ID, LANDMARK_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
