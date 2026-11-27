import { ApiProperty } from '@nestjs/swagger';
import { VerificationStatus } from '../../source';
import {
  PopulationHistorySourceData,
  PopulationHistorySourceDto,
} from './population-history-response.dto';

export interface PopulationConflictSqlRecord {
  id: string;
  sourceId: string;
  value: number | string;
  status: VerificationStatus;
}

export interface PopulationConflictSqlGroup {
  referenceYear: number | string;
  records: PopulationConflictSqlRecord[];
}

export interface PopulationConflictsQueryResult {
  total: number | string;
  rows: PopulationConflictSqlGroup[];
}

export class PopulationConflictRecordDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty()
  value!: number;

  @ApiProperty({ enum: VerificationStatus })
  status!: VerificationStatus;

  @ApiProperty({ type: PopulationHistorySourceDto })
  source!: PopulationHistorySourceDto;

  static from(
    record: PopulationConflictSqlRecord,
    source: PopulationHistorySourceData,
  ): PopulationConflictRecordDto {
    return {
      id: record.id,
      sourceId: record.sourceId,
      value: Number(record.value),
      status: record.status,
      source: PopulationHistorySourceDto.from(source),
    };
  }
}

export class PopulationConflictGroupDto {
  @ApiProperty()
  referenceYear!: number;

  @ApiProperty({ type: [PopulationConflictRecordDto] })
  records!: PopulationConflictRecordDto[];
}
