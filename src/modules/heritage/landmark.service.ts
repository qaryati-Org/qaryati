import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryDeepPartialEntity, Repository } from 'typeorm';
import { isForeignKeyViolation } from '../../common/database/pg-errors';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { assertTransition, SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreateLandmarkDto } from './dto/create-landmark.dto';
import { LandmarkQueryDto } from './dto/landmark-query.dto';
import { LandmarkResponseDto } from './dto/landmark-response.dto';
import { RejectLandmarkDto } from './dto/reject-landmark.dto';
import { UpdateLandmarkDto } from './dto/update-landmark.dto';
import { VerifyLandmarkDto } from './dto/verify-landmark.dto';
import { Landmark } from './entities/landmark.entity';

const SOURCE_FOREIGN_KEY = 'landmarks_source_id_fkey';

export interface LandmarkReviewerContext {
  readonly reviewerId: string;
}

@Injectable()
export class LandmarkService {
  constructor(
    @InjectRepository(Landmark)
    private readonly landmarks: Repository<Landmark>,
    private readonly villages: VillageService,
    private readonly sources: SourceService,
  ) {}

  async create(
    villageId: string,
    dto: CreateLandmarkDto,
  ): Promise<LandmarkResponseDto> {
    await this.villages.findOne(villageId);
    await this.sources.ensureExists(dto.sourceId);

    const landmark = this.landmarks.create({
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

    let saved: Landmark;
    try {
      saved = await this.landmarks.save(landmark);
    } catch (error) {
      this.handleSourceWriteError(error, dto.sourceId);
    }
    return this.toResponse(saved);
  }

  async list(
    villageId: string,
    query: LandmarkQueryDto,
  ): Promise<Paginated<LandmarkResponseDto>> {
    await this.villages.findOne(villageId);

    const queryBuilder = this.landmarks
      .createQueryBuilder('landmark')
      .where('landmark.villageId = :villageId', { villageId })
      .andWhere('landmark.status = :status', {
        status: VerificationStatus.VERIFIED,
      });

    if (query.type !== undefined) {
      queryBuilder.andWhere('landmark.type = :type', { type: query.type });
    }

    const [landmarks, total] = await queryBuilder
      .orderBy('landmark.name', 'ASC')
      .addOrderBy('landmark.id', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    const sources = await this.sources.findByIds([
      ...new Set(landmarks.map((landmark) => landmark.sourceId)),
    ]);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const data = landmarks.map((landmark) => {
      const source = sourcesById.get(landmark.sourceId);
      if (!source) {
        throw new InternalServerErrorException(
          'Landmark contains an unavailable source',
        );
      }
      return LandmarkResponseDto.from(landmark, source);
    });

    return paginate(data, total, query);
  }

  async findOne(
    villageId: string,
    landmarkId: string,
  ): Promise<LandmarkResponseDto> {
    await this.villages.findOne(villageId);
    const landmark = await this.landmarks.findOneBy({
      id: landmarkId,
      villageId,
      status: VerificationStatus.VERIFIED,
    });
    if (!landmark) {
      throw new NotFoundException(
        `Landmark ${landmarkId} not found for village ${villageId}`,
      );
    }
    return this.toResponse(landmark);
  }

  async update(
    villageId: string,
    landmarkId: string,
    dto: UpdateLandmarkDto,
  ): Promise<LandmarkResponseDto> {
    const landmark = await this.getOrFail(villageId, landmarkId);
    if (landmark.status !== VerificationStatus.PENDING) {
      throw new ConflictException('Only PENDING landmarks can be updated');
    }

    const patch: QueryDeepPartialEntity<Landmark> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.sourceId !== undefined) {
      await this.sources.ensureExists(dto.sourceId);
      patch.sourceId = dto.sourceId;
    }

    if (Object.keys(patch).length === 0) {
      return this.toResponse(landmark);
    }

    try {
      const result = await this.landmarks.update(
        {
          id: landmarkId,
          villageId,
          status: VerificationStatus.PENDING,
        },
        patch,
      );
      if (result.affected !== 1) {
        throw new ConflictException('Landmark status changed during update');
      }
    } catch (error) {
      this.handleSourceWriteError(error, dto.sourceId ?? landmark.sourceId);
    }

    return this.toResponse(await this.getOrFail(villageId, landmarkId));
  }

  async remove(villageId: string, landmarkId: string): Promise<void> {
    const landmark = await this.getOrFail(villageId, landmarkId);
    if (landmark.status === VerificationStatus.VERIFIED) {
      throw new ConflictException('VERIFIED landmarks cannot be deleted');
    }

    const result = await this.landmarks.delete({
      id: landmarkId,
      villageId,
      status: In([VerificationStatus.PENDING, VerificationStatus.REJECTED]),
    });
    if (result.affected !== 1) {
      throw new ConflictException('Landmark status changed before deletion');
    }
  }

  verify(
    villageId: string,
    landmarkId: string,
    trustedReviewerContext: LandmarkReviewerContext,
    dto: VerifyLandmarkDto,
  ): Promise<LandmarkResponseDto> {
    return this.review(
      villageId,
      landmarkId,
      trustedReviewerContext,
      VerificationStatus.VERIFIED,
      dto.reviewNote ?? null,
    );
  }

  reject(
    villageId: string,
    landmarkId: string,
    trustedReviewerContext: LandmarkReviewerContext,
    dto: RejectLandmarkDto,
  ): Promise<LandmarkResponseDto> {
    return this.review(
      villageId,
      landmarkId,
      trustedReviewerContext,
      VerificationStatus.REJECTED,
      dto.reviewNote,
    );
  }

  private async getOrFail(
    villageId: string,
    landmarkId: string,
  ): Promise<Landmark> {
    const landmark = await this.landmarks.findOneBy({
      id: landmarkId,
      villageId,
    });
    if (!landmark) {
      throw new NotFoundException(
        `Landmark ${landmarkId} not found for village ${villageId}`,
      );
    }
    return landmark;
  }

  private async review(
    villageId: string,
    landmarkId: string,
    trustedReviewerContext: LandmarkReviewerContext,
    targetStatus: VerificationStatus,
    reviewNote: string | null,
  ): Promise<LandmarkResponseDto> {
    const landmark = await this.getOrFail(villageId, landmarkId);
    assertTransition(landmark.status, targetStatus);

    const result = await this.landmarks.update(
      {
        id: landmarkId,
        villageId,
        status: landmark.status,
      },
      {
        status: targetStatus,
        reviewedAt: new Date(),
        reviewedById: trustedReviewerContext.reviewerId,
        reviewNote,
      },
    );
    if (result.affected !== 1) {
      throw new ConflictException('Landmark status changed during review');
    }

    return this.toResponse(await this.getOrFail(villageId, landmarkId));
  }

  private async toResponse(landmark: Landmark): Promise<LandmarkResponseDto> {
    const [source] = await this.sources.findByIds([landmark.sourceId]);
    if (!source) {
      throw new InternalServerErrorException(
        'Landmark contains an unavailable source',
      );
    }
    return LandmarkResponseDto.from(landmark, source);
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
