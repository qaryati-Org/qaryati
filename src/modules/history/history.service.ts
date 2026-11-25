import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryDeepPartialEntity, Repository } from 'typeorm';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../common/database/pg-errors';
import { ValidationException } from '../../common/errors/validation.exception';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { SourceService, VerificationStatus } from '../source';
import { VillageService } from '../village/village.service';
import { CreateHistoryRecordDto } from './dto/create-history-record.dto';
import { HistoryRecordQueryDto } from './dto/history-record-query.dto';
import { HistoryRecordResponseDto } from './dto/history-record-response.dto';
import { UpdateHistoryRecordDto } from './dto/update-history-record.dto';
import { HistoryRecord } from './entities/history-record.entity';

const UNIQUE_OVERVIEW_CONSTRAINT = 'uq_history_records_village_overview';
const SOURCE_FOREIGN_KEY = 'history_records_source_id_fkey';

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(HistoryRecord)
    private readonly historyRecords: Repository<HistoryRecord>,
    private readonly villages: VillageService,
    private readonly sources: SourceService,
  ) {}

  async create(
    villageId: string,
    dto: CreateHistoryRecordDto,
  ): Promise<HistoryRecordResponseDto> {
    await this.villages.findOne(villageId);
    await this.sources.ensureExists(dto.sourceId);
    this.assertYearRange(dto.startYear, dto.endYear);

    const record = this.historyRecords.create({
      villageId,
      sourceId: dto.sourceId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      startYear: dto.startYear ?? null,
      endYear: dto.endYear ?? null,
      status: VerificationStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNote: null,
    });
    const saved = await this.save(record);
    return this.toResponse(saved);
  }

  async list(
    villageId: string,
    query: HistoryRecordQueryDto,
  ): Promise<Paginated<HistoryRecordResponseDto>> {
    await this.villages.findOne(villageId);

    const queryBuilder = this.historyRecords
      .createQueryBuilder('record')
      .where('record.villageId = :villageId', { villageId })
      .andWhere('record.status = :status', {
        status: VerificationStatus.VERIFIED,
      });

    if (query.type !== undefined) {
      queryBuilder.andWhere('record.type = :type', { type: query.type });
    }

    const [records, total] = await queryBuilder
      .orderBy('record.startYear', 'ASC', 'NULLS FIRST')
      .addOrderBy('record.id', 'ASC')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    const sources = await this.sources.findByIds([
      ...new Set(records.map((record) => record.sourceId)),
    ]);
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const data = records.map((record) => {
      const source = sourcesById.get(record.sourceId);
      if (!source) {
        throw new InternalServerErrorException(
          'History record contains an unavailable source',
        );
      }
      return HistoryRecordResponseDto.from(record, source);
    });

    return paginate(data, total, query);
  }

  async update(
    villageId: string,
    recordId: string,
    dto: UpdateHistoryRecordDto,
  ): Promise<HistoryRecordResponseDto> {
    const record = await this.getOrFail(villageId, recordId);
    if (record.status !== VerificationStatus.PENDING) {
      throw new ConflictException(
        'Only PENDING history records can be updated',
      );
    }

    const startYear =
      dto.startYear !== undefined ? dto.startYear : record.startYear;
    const endYear = dto.endYear !== undefined ? dto.endYear : record.endYear;
    this.assertYearRange(startYear, endYear);

    const patch: QueryDeepPartialEntity<HistoryRecord> = {};
    if (dto.sourceId !== undefined) {
      await this.sources.ensureExists(dto.sourceId);
      patch.sourceId = dto.sourceId;
    }
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.startYear !== undefined) patch.startYear = dto.startYear;
    if (dto.endYear !== undefined) patch.endYear = dto.endYear;

    if (Object.keys(patch).length === 0) {
      return this.toResponse(record);
    }

    try {
      const result = await this.historyRecords.update(
        {
          id: recordId,
          villageId,
          status: VerificationStatus.PENDING,
        },
        patch,
      );
      if (result.affected !== 1) {
        throw new ConflictException(
          'History record status changed during update',
        );
      }
    } catch (error) {
      this.handleWriteError(error, dto.sourceId ?? record.sourceId);
    }

    return this.toResponse(await this.getOrFail(villageId, recordId));
  }

  async remove(villageId: string, recordId: string): Promise<void> {
    const record = await this.getOrFail(villageId, recordId);
    if (record.status === VerificationStatus.VERIFIED) {
      throw new ConflictException('VERIFIED history records cannot be deleted');
    }
    const result = await this.historyRecords.delete({
      id: recordId,
      villageId,
      status: In([VerificationStatus.PENDING, VerificationStatus.REJECTED]),
    });
    if (result.affected !== 1) {
      throw new ConflictException(
        'History record status changed before deletion',
      );
    }
  }

  private async getOrFail(
    villageId: string,
    recordId: string,
  ): Promise<HistoryRecord> {
    const record = await this.historyRecords.findOneBy({
      id: recordId,
      villageId,
    });
    if (!record) {
      throw new NotFoundException(
        `History record ${recordId} not found for village ${villageId}`,
      );
    }
    return record;
  }

  private async toResponse(
    record: HistoryRecord,
  ): Promise<HistoryRecordResponseDto> {
    const [source] = await this.sources.findByIds([record.sourceId]);
    if (!source) {
      throw new InternalServerErrorException(
        'History record contains an unavailable source',
      );
    }
    return HistoryRecordResponseDto.from(record, source);
  }

  private assertYearRange(
    startYear: number | null | undefined,
    endYear: number | null | undefined,
  ): void {
    const start = startYear ?? null;
    const end = endYear ?? null;
    const errors: { field: string; messages: string[] }[] = [];

    if (
      start !== null &&
      (!Number.isInteger(start) || start === 0 || start > 2100)
    ) {
      errors.push({
        field: 'startYear',
        messages: [
          'startYear must be an integer other than zero and at most 2100',
        ],
      });
    }
    if (end !== null && (!Number.isInteger(end) || end === 0 || end > 2100)) {
      errors.push({
        field: 'endYear',
        messages: [
          'endYear must be an integer other than zero and at most 2100',
        ],
      });
    }
    if (end !== null && start === null) {
      errors.push({
        field: 'endYear',
        messages: ['endYear requires startYear'],
      });
    } else if (start !== null && end !== null && start > end) {
      errors.push({
        field: 'endYear',
        messages: ['endYear must be greater than or equal to startYear'],
      });
    }

    if (errors.length > 0) {
      throw new ValidationException(errors);
    }
  }

  private async save(record: HistoryRecord): Promise<HistoryRecord> {
    try {
      return await this.historyRecords.save(record);
    } catch (error) {
      return this.handleWriteError(error, record.sourceId);
    }
  }

  private handleWriteError(error: unknown, sourceId: string): never {
    if (isUniqueViolation(error, UNIQUE_OVERVIEW_CONSTRAINT)) {
      throw new ConflictException(
        'A history overview already exists for this village',
      );
    }
    if (isForeignKeyViolation(error, SOURCE_FOREIGN_KEY)) {
      throw new UnprocessableEntityException(
        `Source ${sourceId} does not exist`,
      );
    }
    throw error;
  }
}
