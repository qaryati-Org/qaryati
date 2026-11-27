import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/database/pg-errors';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { ValidationException } from '../../common/errors/validation.exception';
import type { AuthenticatedUser } from '../auth';
import { Role } from '../auth';
import { assertTransition, SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreatePopulationRecordDto } from './dto/create-population-record.dto';
import { PopulationConflictsQueryDto } from './dto/population-conflicts-query.dto';
import {
  PopulationConflictGroupDto,
  PopulationConflictRecordDto,
  PopulationConflictsQueryResult,
} from './dto/population-conflicts-response.dto';
import { PopulationHistoryQueryDto } from './dto/population-history-query.dto';
import {
  PopulationHistoryQueryResult,
  PopulationHistoryResponseDto,
} from './dto/population-history-response.dto';
import {
  PopulationRecordQueryDto,
  PopulationSortField,
} from './dto/population-record-query.dto';
import { PopulationRecordResponseDto } from './dto/population-record-response.dto';
import { RejectPopulationRecordDto } from './dto/reject-population-record.dto';
import { UpdatePopulationRecordDto } from './dto/update-population-record.dto';
import { VerifyPopulationRecordDto } from './dto/verify-population-record.dto';
import { PopulationRecord } from './entities/population-record.entity';

const PG_UNIQUE_VIOLATION = '23505';
const DUPLICATE_POPULATION_RECORD_CONSTRAINT =
  'uq_population_records_village_year_value_source';
const VERIFIED_POPULATION_CONSTRAINT =
  'uq_population_records_verified_village_year';
const POPULATION_SORT_COLUMNS: Record<PopulationSortField, string> = {
  referenceYear: 'record.referenceYear',
  value: 'record.value',
  createdAt: 'record.createdAt',
};

export const POPULATION_HISTORY_SQL = `
WITH verified_history AS (
  SELECT
    id,
    village_id AS "villageId",
    source_id AS "sourceId",
    reference_year AS "referenceYear",
    value,
    LAG(reference_year) OVER history AS "previousReferenceYear",
    LAG(value) OVER history AS "previousValue"
  FROM population_records
  WHERE village_id = $1
    AND status = 'VERIFIED'
  WINDOW history AS (ORDER BY reference_year ASC, id ASC)
),
page AS (
  SELECT
    id,
    "villageId",
    "sourceId",
    "referenceYear",
    value,
    "previousReferenceYear",
    "previousValue",
    value - "previousValue" AS "populationChange"
  FROM verified_history
  ORDER BY "referenceYear" ASC, id ASC
  LIMIT $2 OFFSET $3
)
SELECT
  (SELECT COUNT(*)::int FROM verified_history) AS total,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', page.id,
          'villageId', page."villageId",
          'sourceId', page."sourceId",
          'referenceYear', page."referenceYear",
          'value', page.value,
          'previousReferenceYear', page."previousReferenceYear",
          'previousValue', page."previousValue",
          'populationChange', page."populationChange"
        )
        ORDER BY page."referenceYear" ASC, page.id ASC
      )
      FROM page
    ),
    '[]'::json
  ) AS rows`;

export const POPULATION_CONFLICTS_SQL = `
WITH conflicting_years AS (
  SELECT reference_year AS "referenceYear"
  FROM population_records
  WHERE village_id = $1
  GROUP BY reference_year
  HAVING COUNT(DISTINCT value) >= 2
),
page AS (
  SELECT "referenceYear"
  FROM conflicting_years
  ORDER BY "referenceYear" ASC
  LIMIT $2 OFFSET $3
),
conflicts AS (
  SELECT
    page."referenceYear",
    json_agg(
      json_build_object(
        'id', record.id,
        'sourceId', record.source_id,
        'value', record.value,
        'status', record.status
      )
      ORDER BY record.id ASC
    ) AS records
  FROM page
  JOIN population_records record
    ON record.village_id = $1
   AND record.reference_year = page."referenceYear"
  GROUP BY page."referenceYear"
)
SELECT
  (SELECT COUNT(*)::int FROM conflicting_years) AS total,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'referenceYear', conflicts."referenceYear",
          'records', conflicts.records
        )
        ORDER BY conflicts."referenceYear" ASC
      )
      FROM conflicts
    ),
    '[]'::json
  ) AS rows`;

export interface PopulationReviewerContext {
  readonly reviewerId: string;
}

@Injectable()
export class PopulationService {
  constructor(
    @InjectRepository(PopulationRecord)
    private readonly populationRecords: Repository<PopulationRecord>,
    private readonly villages: VillageService,
    private readonly sources: SourceService,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    villageId: string,
    query: PopulationRecordQueryDto,
    user?: AuthenticatedUser,
  ): Promise<Paginated<PopulationRecordResponseDto>> {
    const status = query.status ?? VerificationStatus.VERIFIED;
    if (status !== VerificationStatus.VERIFIED) {
      this.assertCanViewUnverified(user);
    }

    await this.villages.ensureExists(villageId);

    const queryBuilder = this.populationRecords
      .createQueryBuilder('record')
      .where('record.villageId = :villageId', { villageId })
      .andWhere('record.status = :status', { status });

    if (query.year !== undefined) {
      queryBuilder.andWhere('record.referenceYear = :year', {
        year: query.year,
      });
    }
    if (query.sourceId !== undefined) {
      queryBuilder.andWhere('record.sourceId = :sourceId', {
        sourceId: query.sourceId,
      });
    }

    const [records, total] = await queryBuilder
      .orderBy(
        POPULATION_SORT_COLUMNS[query.sort ?? 'referenceYear'],
        query.order === 'desc' ? 'DESC' : 'ASC',
      )
      .addOrderBy('record.id', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    return paginate(
      records.map((record) => PopulationRecordResponseDto.from(record)),
      total,
      query,
    );
  }

  async history(
    villageId: string,
    query: PopulationHistoryQueryDto,
  ): Promise<Paginated<PopulationHistoryResponseDto>> {
    await this.villages.ensureExists(villageId);

    const [result] = await this.dataSource.query<
      PopulationHistoryQueryResult[]
    >(POPULATION_HISTORY_SQL, [villageId, query.limit, query.offset]);
    if (!result) {
      throw new InternalServerErrorException(
        'Population history query returned no result',
      );
    }
    if (result.rows.length === 0) {
      return paginate([], Number(result.total), query);
    }

    const sources = await this.sources.findByIds([
      ...new Set(result.rows.map((row) => row.sourceId)),
    ]);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const data = result.rows.map((row) => {
      const source = sourcesById.get(row.sourceId);
      if (!source) {
        throw new InternalServerErrorException(
          'Population history contains a record with an unavailable source',
        );
      }
      return PopulationHistoryResponseDto.from(row, source);
    });

    return paginate(data, Number(result.total), query);
  }

  async conflicts(
    villageId: string,
    query: PopulationConflictsQueryDto,
  ): Promise<Paginated<PopulationConflictGroupDto>> {
    await this.villages.ensureExists(villageId);

    const [result] = await this.dataSource.query<
      PopulationConflictsQueryResult[]
    >(POPULATION_CONFLICTS_SQL, [villageId, query.limit, query.offset]);
    if (!result) {
      throw new InternalServerErrorException(
        'Population conflicts query returned no result',
      );
    }
    if (result.rows.length === 0) {
      return paginate([], Number(result.total), query);
    }

    const sources = await this.sources.findByIds([
      ...new Set(
        result.rows.flatMap((group) =>
          group.records.map((record) => record.sourceId),
        ),
      ),
    ]);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const data = result.rows.map((group) => {
      const records = group.records.map((record) => {
        const source = sourcesById.get(record.sourceId);
        if (!source) {
          throw new InternalServerErrorException(
            'Population conflicts contain a record with an unavailable source',
          );
        }
        return PopulationConflictRecordDto.from(record, source);
      });
      return {
        referenceYear: Number(group.referenceYear),
        records,
      };
    });

    return paginate(data, Number(result.total), query);
  }

  async findOne(
    villageId: string,
    recordId: string,
    user?: AuthenticatedUser,
  ): Promise<PopulationRecordResponseDto> {
    const record = await this.getOrFail(villageId, recordId);
    if (record.status !== VerificationStatus.VERIFIED) {
      this.assertCanViewUnverified(user);
    }
    return PopulationRecordResponseDto.from(record);
  }

  async create(
    villageId: string,
    dto: CreatePopulationRecordDto,
  ): Promise<PopulationRecordResponseDto> {
    await this.villages.ensureExists(villageId);
    await this.sources.ensureExists(dto.sourceId);
    this.assertYearNotInFuture(dto.referenceYear);

    const record = this.populationRecords.create({
      villageId,
      sourceId: dto.sourceId,
      value: dto.value,
      referenceYear: dto.referenceYear,
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
    });
    return this.saveRecord(record);
  }

  async update(
    villageId: string,
    recordId: string,
    dto: UpdatePopulationRecordDto,
  ): Promise<PopulationRecordResponseDto> {
    const record = await this.getOrFail(villageId, recordId);
    if (record.status !== VerificationStatus.PENDING) {
      throw new ConflictException(
        'Only PENDING population records can be updated',
      );
    }

    this.assertYearNotInFuture(dto.referenceYear ?? record.referenceYear);
    if (dto.sourceId !== undefined) {
      await this.sources.ensureExists(dto.sourceId);
    }

    if (dto.value !== undefined) {
      record.value = dto.value;
    }
    if (dto.referenceYear !== undefined) {
      record.referenceYear = dto.referenceYear;
    }
    if (dto.sourceId !== undefined) {
      record.sourceId = dto.sourceId;
    }

    return this.saveRecord(record);
  }

  async remove(villageId: string, recordId: string): Promise<void> {
    const record = await this.getOrFail(villageId, recordId);
    if (record.status === VerificationStatus.VERIFIED) {
      throw new ConflictException(
        'VERIFIED population records cannot be deleted',
      );
    }
    await this.populationRecords.remove(record);
  }

  verify(
    villageId: string,
    recordId: string,
    reviewer: PopulationReviewerContext,
    dto: VerifyPopulationRecordDto,
  ): Promise<PopulationRecordResponseDto> {
    return this.review(
      villageId,
      recordId,
      reviewer,
      VerificationStatus.VERIFIED,
      dto.reviewNote ?? null,
    );
  }

  reject(
    villageId: string,
    recordId: string,
    reviewer: PopulationReviewerContext,
    dto: RejectPopulationRecordDto,
  ): Promise<PopulationRecordResponseDto> {
    return this.review(
      villageId,
      recordId,
      reviewer,
      VerificationStatus.REJECTED,
      dto.reviewNote,
    );
  }

  private async getOrFail(
    villageId: string,
    recordId: string,
  ): Promise<PopulationRecord> {
    const record = await this.populationRecords.findOneBy({
      id: recordId,
      villageId,
    });
    if (!record) {
      throw new NotFoundException(
        `Population record ${recordId} not found for village ${villageId}`,
      );
    }
    return record;
  }

  private assertCanViewUnverified(user?: AuthenticatedUser): void {
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }
    if (![Role.EDITOR, Role.VERIFIER, Role.ADMIN].includes(user.role)) {
      throw new ForbiddenException(
        'Your role is not allowed to view unverified population records',
      );
    }
  }

  private async review(
    villageId: string,
    recordId: string,
    reviewer: PopulationReviewerContext,
    targetStatus: VerificationStatus,
    reviewNote: string | null,
  ): Promise<PopulationRecordResponseDto> {
    const record = await this.getOrFail(villageId, recordId);
    assertTransition(record.status, targetStatus);

    try {
      const [updatedRecords, affectedRowCount] = await this.dataSource.query<
        [PopulationRecord[], number]
      >(
        `UPDATE population_records
         SET status = $1,
             reviewed_at = $2,
             reviewed_by_id = $3,
             review_note = $4,
             updated_at = now()
         WHERE id = $5
           AND village_id = $6
           AND status = $7
         RETURNING
           id,
           village_id AS "villageId",
           source_id AS "sourceId",
           value,
           reference_year AS "referenceYear",
           status,
           reviewed_at AS "reviewedAt",
           reviewed_by_id AS "reviewedById",
           review_note AS "reviewNote",
           created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [
          targetStatus,
          new Date(),
          reviewer.reviewerId,
          reviewNote,
          recordId,
          villageId,
          record.status,
        ],
      );
      if (affectedRowCount !== 1 || updatedRecords.length !== 1) {
        throw new ConflictException(
          'Population record status changed during review',
        );
      }
      return PopulationRecordResponseDto.from(updatedRecords[0]);
    } catch (error) {
      if (isUniqueViolation(error, VERIFIED_POPULATION_CONSTRAINT)) {
        throw new ConflictException(
          'A verified population record already exists for this village and year',
        );
      }
      throw error;
    }
  }

  private assertYearNotInFuture(year?: number): void {
    if (year !== undefined && year > new Date().getFullYear()) {
      throw new ValidationException([
        {
          field: 'referenceYear',
          messages: ['referenceYear cannot be in the future'],
        },
      ]);
    }
  }

  private async saveRecord(
    record: PopulationRecord,
  ): Promise<PopulationRecordResponseDto> {
    try {
      const saved = await this.populationRecords.save(record);
      return PopulationRecordResponseDto.from(saved);
    } catch (error) {
      if (isDuplicatePopulationRecordError(error)) {
        throw new ConflictException(
          'This population figure already exists for the village, year, and source',
        );
      }
      throw error;
    }
  }
}

function isDuplicatePopulationRecordError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError: unknown = error.driverError;
  if (typeof driverError !== 'object' || driverError === null) {
    return false;
  }

  if (!('code' in driverError) || !('constraint' in driverError)) {
    return false;
  }

  return (
    driverError.code === PG_UNIQUE_VIOLATION &&
    driverError.constraint === DUPLICATE_POPULATION_RECORD_CONSTRAINT
  );
}
