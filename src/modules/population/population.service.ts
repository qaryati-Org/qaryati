import {
  ConflictException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { ValidationException } from '../../common/errors/validation.exception';
import { SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreatePopulationRecordDto } from './dto/create-population-record.dto';
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
import { UpdatePopulationRecordDto } from './dto/update-population-record.dto';
import { PopulationRecord } from './entities/population-record.entity';

const PG_UNIQUE_VIOLATION = '23505';
const DUPLICATE_POPULATION_RECORD_CONSTRAINT =
  'uq_population_records_village_year_value_source';
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
  ): Promise<Paginated<PopulationRecordResponseDto>> {
    await this.villages.findOne(villageId);

    const queryBuilder = this.populationRecords
      .createQueryBuilder('record')
      .where('record.villageId = :villageId', { villageId })
      .andWhere('record.status = :status', {
        status: query.status ?? VerificationStatus.VERIFIED,
      });

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
    await this.villages.findOne(villageId);

    const [result] = await this.dataSource.query<
      PopulationHistoryQueryResult[]
    >(POPULATION_HISTORY_SQL, [villageId, query.limit, query.offset]);
    if (!result) {
      throw new InternalServerErrorException(
        'Population history query returned no result',
      );
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

  async findOne(
    villageId: string,
    recordId: string,
  ): Promise<PopulationRecordResponseDto> {
    const record = await this.getOrFail(villageId, recordId);
    return PopulationRecordResponseDto.from(record);
  }

  async create(
    villageId: string,
    dto: CreatePopulationRecordDto,
  ): Promise<PopulationRecordResponseDto> {
    await this.villages.findOne(villageId);
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
