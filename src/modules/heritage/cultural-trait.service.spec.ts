import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreateCulturalTraitDto } from './dto/create-cultural-trait.dto';
import { CulturalTraitQueryDto } from './dto/cultural-trait-query.dto';
import { UpdateCulturalTraitDto } from './dto/update-cultural-trait.dto';
import {
  CulturalTrait,
  CulturalTraitType,
} from './entities/cultural-trait.entity';
import {
  CulturalTraitReviewerContext,
  CulturalTraitService,
} from './cultural-trait.service';

const VILLAGE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VILLAGE_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_SOURCE_ID = '00000000-0000-4000-8000-000000000004';
const TRAIT_ID = '00000000-0000-4000-8000-000000000005';
const REVIEWER_ID = '00000000-0000-4000-8000-000000000006';
const SOURCE_FOREIGN_KEY = 'cultural_traits_source_id_fkey';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

const culturalTrait = (
  overrides: Partial<CulturalTrait> = {},
): CulturalTrait => ({
  id: TRAIT_ID,
  villageId: VILLAGE_ID,
  sourceId: SOURCE_ID,
  name: 'Traditional weaving',
  type: CulturalTraitType.CRAFT,
  description: 'A locally practiced weaving tradition',
  status: VerificationStatus.PENDING,
  reviewedAt: null,
  reviewedById: null,
  reviewNote: null,
  createdAt,
  updatedAt,
  ...overrides,
});

const source = (id = SOURCE_ID, title = `Source ${id}`) => ({
  id,
  title,
  type: 'BOOK',
  author: 'Researcher',
  url: `https://example.test/${id}`,
  year: 2000,
  createdAt,
  updatedAt,
});

const createDto = (
  overrides: Partial<CreateCulturalTraitDto> = {},
): CreateCulturalTraitDto =>
  Object.assign(new CreateCulturalTraitDto(), {
    name: 'Traditional weaving',
    type: CulturalTraitType.CRAFT,
    description: 'A locally practiced weaving tradition',
    sourceId: SOURCE_ID,
    ...overrides,
  });

const queryDto = (
  overrides: Partial<CulturalTraitQueryDto> = {},
): CulturalTraitQueryDto =>
  Object.assign(new CulturalTraitQueryDto(), overrides);

function pgError(code: string, constraint?: string): QueryFailedError {
  const driverError = Object.assign(new Error(`database error ${code}`), {
    code,
    constraint,
  });
  return new QueryFailedError('cultural_traits write', [], driverError);
}

describe('CulturalTraitService', () => {
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
  let villages: { findOne: jest.Mock };
  let sources: { ensureExists: jest.Mock; findByIds: jest.Mock };
  let service: CulturalTraitService;

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
      create: jest.fn((fields: Partial<CulturalTrait>) =>
        culturalTrait(fields),
      ),
      save: jest.fn((record: CulturalTrait) => Promise.resolve(record)),
      findOneBy: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    villages = { findOne: jest.fn().mockResolvedValue({ id: VILLAGE_ID }) };
    sources = {
      ensureExists: jest.fn().mockResolvedValue(undefined),
      findByIds: jest.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => source(id))),
      ),
    };
    service = new CulturalTraitService(
      repository as unknown as Repository<CulturalTrait>,
      villages as unknown as VillageService,
      sources as unknown as SourceService,
    );
  });

  describe('create', () => {
    it('creates a PENDING record with null review metadata and provenance', async () => {
      const result = await service.create(VILLAGE_ID, createDto());

      expect(villages.findOne).toHaveBeenCalledWith(VILLAGE_ID);
      expect(sources.ensureExists).toHaveBeenCalledWith(SOURCE_ID);
      expect(repository.create).toHaveBeenCalledWith({
        villageId: VILLAGE_ID,
        sourceId: SOURCE_ID,
        name: 'Traditional weaving',
        type: CulturalTraitType.CRAFT,
        description: 'A locally practiced weaving tradition',
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

    it('returns 404 for an unknown village without checking the source or saving', async () => {
      villages.findOne.mockRejectedValueOnce(
        new NotFoundException('Village not found'),
      );

      await expect(
        service.create(VILLAGE_ID, createDto()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(sources.ensureExists).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
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

    it('allows multiple records of the same type in one village', async () => {
      await service.create(VILLAGE_ID, createDto());
      await service.create(
        VILLAGE_ID,
        createDto({ name: 'Another weaving tradition' }),
      );

      expect(repository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('list', () => {
    it('filters to VERIFIED records and includes source provenance', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [culturalTrait({ status: VerificationStatus.VERIFIED })],
        1,
      ]);

      const result = await service.list(VILLAGE_ID, queryDto());

      expect(villages.findOne).toHaveBeenCalledWith(VILLAGE_ID);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'culturalTrait.status = :status',
        { status: VerificationStatus.VERIFIED },
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        status: VerificationStatus.VERIFIED,
        source: { id: SOURCE_ID, title: `Source ${SOURCE_ID}` },
      });
    });

    it.each(Object.values(CulturalTraitType))(
      'filters by cultural trait type %s',
      async (type) => {
        await service.list(VILLAGE_ID, queryDto({ type }));

        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
          'culturalTrait.type = :type',
          { type },
        );
      },
    );

    it('sorts by name ascending and then ID ascending', async () => {
      await service.list(VILLAGE_ID, queryDto());

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'culturalTrait.name',
        'ASC',
      );
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
        'culturalTrait.id',
        'ASC',
      );
    });

    it('applies pagination and returns total-count metadata', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [culturalTrait({ status: VerificationStatus.VERIFIED })],
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

    it('loads all page sources in one bulk lookup', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [
          culturalTrait({
            id: TRAIT_ID,
            status: VerificationStatus.VERIFIED,
          }),
          culturalTrait({
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

    it('throws an internal error when a listed source is missing', async () => {
      queryBuilder.getManyAndCount.mockResolvedValueOnce([
        [culturalTrait({ status: VerificationStatus.VERIFIED })],
        1,
      ]);
      sources.findByIds.mockResolvedValueOnce([]);

      await expect(service.list(VILLAGE_ID, queryDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('returns 404 for an unknown village', async () => {
      villages.findOne.mockRejectedValueOnce(
        new NotFoundException('Village not found'),
      );

      await expect(service.list(VILLAGE_ID, queryDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates only supplied editable fields and preserves review metadata', async () => {
      const original = culturalTrait({
        reviewedAt: updatedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Existing metadata',
      });
      repository.findOneBy
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(
          culturalTrait({ ...original, name: 'Updated weaving' }),
        );

      const result = await service.update(
        VILLAGE_ID,
        TRAIT_ID,
        Object.assign(new UpdateCulturalTraitDto(), {
          name: 'Updated weaving',
        }),
      );

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: TRAIT_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.PENDING,
        },
        { name: 'Updated weaving' },
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
      expect(result.name).toBe('Updated weaving');
    });

    it.each([VerificationStatus.VERIFIED, VerificationStatus.REJECTED])(
      'rejects editing a %s record',
      async (status) => {
        repository.findOneBy.mockResolvedValueOnce(culturalTrait({ status }));

        await expect(
          service.update(
            VILLAGE_ID,
            TRAIT_ID,
            Object.assign(new UpdateCulturalTraitDto(), { name: 'Changed' }),
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for an unknown or wrong-village record', async () => {
      await expect(
        service.update(
          OTHER_VILLAGE_ID,
          TRAIT_ID,
          Object.assign(new UpdateCulturalTraitDto(), { name: 'Changed' }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: TRAIT_ID,
        villageId: OTHER_VILLAGE_ID,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('validates changed sources and maps source foreign-key races', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(culturalTrait())
        .mockResolvedValueOnce(culturalTrait({ sourceId: OTHER_SOURCE_ID }));

      await service.update(
        VILLAGE_ID,
        TRAIT_ID,
        Object.assign(new UpdateCulturalTraitDto(), {
          sourceId: OTHER_SOURCE_ID,
        }),
      );

      expect(sources.ensureExists).toHaveBeenCalledWith(OTHER_SOURCE_ID);
      expect(repository.update).toHaveBeenCalledWith(expect.any(Object), {
        sourceId: OTHER_SOURCE_ID,
      });

      repository.findOneBy.mockResolvedValueOnce(culturalTrait());
      repository.update.mockRejectedValueOnce(
        pgError('23503', SOURCE_FOREIGN_KEY),
      );
      await expect(
        service.update(
          VILLAGE_ID,
          TRAIT_ID,
          Object.assign(new UpdateCulturalTraitDto(), {
            sourceId: OTHER_SOURCE_ID,
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('returns 409 when the conditional update affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(culturalTrait());
      repository.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.update(
          VILLAGE_ID,
          TRAIT_ID,
          Object.assign(new UpdateCulturalTraitDto(), { name: 'Changed' }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the existing mapped record for an empty update', async () => {
      repository.findOneBy.mockResolvedValueOnce(culturalTrait());

      const result = await service.update(
        VILLAGE_ID,
        TRAIT_ID,
        new UpdateCulturalTraitDto(),
      );

      expect(repository.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: TRAIT_ID,
        name: 'Traditional weaving',
        source: { id: SOURCE_ID },
      });
    });
  });

  describe('remove', () => {
    it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
      'deletes a %s record only when ID, village, and status match',
      async (status) => {
        repository.findOneBy.mockResolvedValueOnce(culturalTrait({ status }));

        await service.remove(VILLAGE_ID, TRAIT_ID);

        const [criteria] = repository.delete.mock.calls[0] as [
          {
            id: string;
            villageId: string;
            status: { type: string; value: VerificationStatus[] };
          },
        ];
        expect(criteria.id).toBe(TRAIT_ID);
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
        culturalTrait({ status: VerificationStatus.VERIFIED }),
      );

      await expect(service.remove(VILLAGE_ID, TRAIT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown or wrong-village record', async () => {
      await expect(
        service.remove(OTHER_VILLAGE_ID, TRAIT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('returns 409 when the conditional delete affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(culturalTrait());
      repository.delete.mockResolvedValueOnce({ affected: 0 });

      await expect(service.remove(VILLAGE_ID, TRAIT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('verification and rejection', () => {
    const reviewer: CulturalTraitReviewerContext = { reviewerId: REVIEWER_ID };

    it('transitions PENDING to VERIFIED and atomically stores review metadata', async () => {
      const verified = culturalTrait({
        status: VerificationStatus.VERIFIED,
        reviewedAt: updatedAt,
        reviewedById: REVIEWER_ID,
        reviewNote: 'Evidence confirmed',
      });
      repository.findOneBy
        .mockResolvedValueOnce(culturalTrait())
        .mockResolvedValueOnce(verified);

      const result = await service.verify(VILLAGE_ID, TRAIT_ID, reviewer, {
        reviewNote: 'Evidence confirmed',
      });

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: TRAIT_ID,
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
        .mockResolvedValueOnce(culturalTrait())
        .mockResolvedValueOnce(
          culturalTrait({
            status: VerificationStatus.REJECTED,
            reviewedById: REVIEWER_ID,
            reviewNote: 'Insufficient evidence',
          }),
        );

      await service.reject(VILLAGE_ID, TRAIT_ID, reviewer, {
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
          culturalTrait({ status: VerificationStatus.VERIFIED }),
        )
        .mockResolvedValueOnce(
          culturalTrait({ status: VerificationStatus.REJECTED }),
        );

      await service.reject(VILLAGE_ID, TRAIT_ID, reviewer, {
        reviewNote: 'Later evidence disproved it',
      });

      expect(repository.update).toHaveBeenCalledWith(
        {
          id: TRAIT_ID,
          villageId: VILLAGE_ID,
          status: VerificationStatus.VERIFIED,
        },
        expect.objectContaining({ status: VerificationStatus.REJECTED }),
      );
    });

    it.each(['verify', 'reject'])(
      'treats REJECTED as terminal for %s',
      async (action) => {
        repository.findOneBy.mockResolvedValueOnce(
          culturalTrait({ status: VerificationStatus.REJECTED }),
        );

        const review =
          action === 'verify'
            ? service.verify(VILLAGE_ID, TRAIT_ID, reviewer, {})
            : service.reject(VILLAGE_ID, TRAIT_ID, reviewer, {
                reviewNote: 'Retry',
              });
        await expect(review).rejects.toBeInstanceOf(ConflictException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('rejects verifying an already VERIFIED record', async () => {
      repository.findOneBy.mockResolvedValueOnce(
        culturalTrait({ status: VerificationStatus.VERIFIED }),
      );

      await expect(
        service.verify(VILLAGE_ID, TRAIT_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('does not include Cultural Trait content in a review update', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(culturalTrait())
        .mockResolvedValueOnce(
          culturalTrait({ status: VerificationStatus.VERIFIED }),
        );

      await service.verify(VILLAGE_ID, TRAIT_ID, reviewer, {
        reviewNote: 'Reviewed',
      });

      expect(repository.update.mock.calls[0][1]).toEqual({
        status: VerificationStatus.VERIFIED,
        reviewedAt: expect.any(Date),
        reviewedById: REVIEWER_ID,
        reviewNote: 'Reviewed',
      });
    });

    it('returns 404 for an unknown or wrong-village record', async () => {
      await expect(
        service.verify(OTHER_VILLAGE_ID, TRAIT_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: TRAIT_ID,
        villageId: OTHER_VILLAGE_ID,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('returns 409 when the conditional review update affects no rows', async () => {
      repository.findOneBy.mockResolvedValueOnce(culturalTrait());
      repository.update.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service.verify(VILLAGE_ID, TRAIT_ID, reviewer, {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
