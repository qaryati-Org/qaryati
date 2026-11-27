import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryDeepPartialEntity, Repository } from 'typeorm';
import { isForeignKeyViolation } from '../../common/database/pg-errors';
import { paginate, Paginated } from '../../common/pagination/paginated';
import type { AuthenticatedUser } from '../auth';
import { Role } from '../auth';
import { assertTransition, SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreateCulturalTraitDto } from './dto/create-cultural-trait.dto';
import { CulturalTraitQueryDto } from './dto/cultural-trait-query.dto';
import { CulturalTraitResponseDto } from './dto/cultural-trait-response.dto';
import { RejectCulturalTraitDto } from './dto/reject-cultural-trait.dto';
import { UpdateCulturalTraitDto } from './dto/update-cultural-trait.dto';
import { VerifyCulturalTraitDto } from './dto/verify-cultural-trait.dto';
import { CulturalTrait } from './entities/cultural-trait.entity';

const SOURCE_FOREIGN_KEY = 'cultural_traits_source_id_fkey';

export interface CulturalTraitReviewerContext {
  readonly reviewerId: string;
}

@Injectable()
export class CulturalTraitService {
  constructor(
    @InjectRepository(CulturalTrait)
    private readonly culturalTraits: Repository<CulturalTrait>,
    private readonly villages: VillageService,
    private readonly sources: SourceService,
  ) {}

  async create(
    villageId: string,
    dto: CreateCulturalTraitDto,
  ): Promise<CulturalTraitResponseDto> {
    await this.villages.ensureExists(villageId);
    await this.sources.ensureExists(dto.sourceId);

    const culturalTrait = this.culturalTraits.create({
      villageId,
      sourceId: dto.sourceId,
      name: dto.name,
      type: dto.type,
      description: dto.description,
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
    });

    let saved: CulturalTrait;
    try {
      saved = await this.culturalTraits.save(culturalTrait);
    } catch (error) {
      this.handleSourceWriteError(error, dto.sourceId);
    }
    return this.toResponse(saved);
  }

  async list(
    villageId: string,
    query: CulturalTraitQueryDto,
    user?: AuthenticatedUser,
  ): Promise<Paginated<CulturalTraitResponseDto>> {
    const status = query.status ?? VerificationStatus.VERIFIED;
    if (status !== VerificationStatus.VERIFIED) {
      this.assertCanListUnverified(user);
    }

    await this.villages.ensureExists(villageId);
    
    const queryBuilder = this.culturalTraits
      .createQueryBuilder('culturalTrait')
      .where('culturalTrait.villageId = :villageId', { villageId })
      .andWhere('culturalTrait.status = :status', { status });

    if (query.type !== undefined) {
      queryBuilder.andWhere('culturalTrait.type = :type', {
        type: query.type,
      });
    }

    const [culturalTraits, total] = await queryBuilder
      .orderBy('culturalTrait.name', 'ASC')
      .addOrderBy('culturalTrait.id', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    const sources = await this.sources.findByIds([
      ...new Set(culturalTraits.map((culturalTrait) => culturalTrait.sourceId)),
    ]);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const data = culturalTraits.map((culturalTrait) => {
      const source = sourcesById.get(culturalTrait.sourceId);
      if (!source) {
        throw new InternalServerErrorException(
          'Cultural trait contains an unavailable source',
        );
      }
      return CulturalTraitResponseDto.from(culturalTrait, source);
    });

    return paginate(data, total, query);
  }

  async findOne(
    villageId: string,
    culturalTraitId: string,
  ): Promise<CulturalTraitResponseDto> {
    await this.villages.ensureExists(villageId);
    const culturalTrait = await this.culturalTraits.findOneBy({
      id: culturalTraitId,
      villageId,
      status: VerificationStatus.VERIFIED,
    });
    if (!culturalTrait) {
      throw new NotFoundException(
        `Cultural trait ${culturalTraitId} not found for village ${villageId}`,
      );
    }
    return this.toResponse(culturalTrait);
  }

  async update(
    villageId: string,
    culturalTraitId: string,
    dto: UpdateCulturalTraitDto,
  ): Promise<CulturalTraitResponseDto> {
    const culturalTrait = await this.getOrFail(villageId, culturalTraitId);
    if (culturalTrait.status !== VerificationStatus.PENDING) {
      throw new ConflictException(
        'Only PENDING cultural traits can be updated',
      );
    }

    const patch: QueryDeepPartialEntity<CulturalTrait> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.sourceId !== undefined) {
      await this.sources.ensureExists(dto.sourceId);
      patch.sourceId = dto.sourceId;
    }

    if (Object.keys(patch).length === 0) {
      return this.toResponse(culturalTrait);
    }

    try {
      const result = await this.culturalTraits.update(
        {
          id: culturalTraitId,
          villageId,
          status: VerificationStatus.PENDING,
        },
        patch,
      );
      if (result.affected !== 1) {
        throw new ConflictException(
          'Cultural trait status changed during update',
        );
      }
    } catch (error) {
      this.handleSourceWriteError(
        error,
        dto.sourceId ?? culturalTrait.sourceId,
      );
    }

    return this.toResponse(await this.getOrFail(villageId, culturalTraitId));
  }

  async remove(villageId: string, culturalTraitId: string): Promise<void> {
    const culturalTrait = await this.getOrFail(villageId, culturalTraitId);
    if (culturalTrait.status === VerificationStatus.VERIFIED) {
      throw new ConflictException('VERIFIED cultural traits cannot be deleted');
    }

    const result = await this.culturalTraits.delete({
      id: culturalTraitId,
      villageId,
      status: In([VerificationStatus.PENDING, VerificationStatus.REJECTED]),
    });
    if (result.affected !== 1) {
      throw new ConflictException(
        'Cultural trait status changed before deletion',
      );
    }
  }

  verify(
    villageId: string,
    culturalTraitId: string,
    trustedReviewerContext: CulturalTraitReviewerContext,
    dto: VerifyCulturalTraitDto,
  ): Promise<CulturalTraitResponseDto> {
    return this.review(
      villageId,
      culturalTraitId,
      trustedReviewerContext,
      VerificationStatus.VERIFIED,
      dto.reviewNote ?? null,
    );
  }

  reject(
    villageId: string,
    culturalTraitId: string,
    trustedReviewerContext: CulturalTraitReviewerContext,
    dto: RejectCulturalTraitDto,
  ): Promise<CulturalTraitResponseDto> {
    return this.review(
      villageId,
      culturalTraitId,
      trustedReviewerContext,
      VerificationStatus.REJECTED,
      dto.reviewNote,
    );
  }

  private async getOrFail(
    villageId: string,
    culturalTraitId: string,
  ): Promise<CulturalTrait> {
    const culturalTrait = await this.culturalTraits.findOneBy({
      id: culturalTraitId,
      villageId,
    });
    if (!culturalTrait) {
      throw new NotFoundException(
        `Cultural trait ${culturalTraitId} not found for village ${villageId}`,
      );
    }
    return culturalTrait;
  }

  private assertCanListUnverified(user?: AuthenticatedUser): void {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (![Role.EDITOR, Role.VERIFIER, Role.ADMIN].includes(user.role)) {
      throw new ForbiddenException(
        'Your role is not allowed to view unverified cultural traits',
      );
    }
  }

  private async review(
    villageId: string,
    culturalTraitId: string,
    trustedReviewerContext: CulturalTraitReviewerContext,
    targetStatus: VerificationStatus,
    reviewNote: string | null,
  ): Promise<CulturalTraitResponseDto> {
    const culturalTrait = await this.getOrFail(villageId, culturalTraitId);
    assertTransition(culturalTrait.status, targetStatus);

    const result = await this.culturalTraits.update(
      {
        id: culturalTraitId,
        villageId,
        status: culturalTrait.status,
      },
      {
        status: targetStatus,
        reviewedAt: new Date(),
        reviewedById: trustedReviewerContext.reviewerId,
        reviewNote,
      },
    );
    if (result.affected !== 1) {
      throw new ConflictException(
        'Cultural trait status changed during review',
      );
    }

    return this.toResponse(await this.getOrFail(villageId, culturalTraitId));
  }

  private async toResponse(
    culturalTrait: CulturalTrait,
  ): Promise<CulturalTraitResponseDto> {
    const [source] = await this.sources.findByIds([culturalTrait.sourceId]);
    if (!source) {
      throw new InternalServerErrorException(
        'Cultural trait contains an unavailable source',
      );
    }
    return CulturalTraitResponseDto.from(culturalTrait, source);
  }

  private handleSourceWriteError(error: unknown, sourceId: string): never {
    if (isForeignKeyViolation(error, SOURCE_FOREIGN_KEY)) {
      throw new UnprocessableEntityException(
        `Source ${sourceId} does not exist`,
      );
    }
    throw error;
  }
}
