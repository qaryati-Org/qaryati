import { ApiProperty } from '@nestjs/swagger';
import { VerificationStatus } from '../../source';
import {
  HistoryRecord,
  HistoryRecordType,
} from '../entities/history-record.entity';

export interface HistoryRecordSourceData {
  id: string;
  title: string;
  type: string;
  author: string | null;
  url: string | null;
  year: number | null;
}

export class HistoryRecordSourceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Source type' })
  type!: string;

  @ApiProperty({ nullable: true, type: String })
  author!: string | null;

  @ApiProperty({ nullable: true, type: String })
  url!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Publication year',
  })
  year!: number | null;

  static from(source: HistoryRecordSourceData): HistoryRecordSourceDto {
    return {
      id: source.id,
      title: source.title,
      type: source.type,
      author: source.author,
      url: source.url,
      year: source.year,
    };
  }
}

export class HistoryRecordResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  villageId!: string;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty({ enum: HistoryRecordType })
  type!: HistoryRecordType;

  @ApiProperty({ maxLength: 255 })
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ nullable: true, type: Number })
  startYear!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  endYear!: number | null;

  @ApiProperty({ enum: VerificationStatus })
  status!: VerificationStatus;

  @ApiProperty({ nullable: true, type: Date })
  reviewedAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  reviewedById!: string | null;

  @ApiProperty({ nullable: true, type: String })
  reviewNote!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: HistoryRecordSourceDto })
  source!: HistoryRecordSourceDto;

  static from(
    record: HistoryRecord,
    source: HistoryRecordSourceData,
  ): HistoryRecordResponseDto {
    return {
      id: record.id,
      villageId: record.villageId,
      sourceId: record.sourceId,
      type: record.type,
      title: record.title,
      description: record.description,
      startYear: record.startYear,
      endYear: record.endYear,
      status: record.status,
      reviewedAt: record.reviewedAt,
      reviewedById: record.reviewedById,
      reviewNote: record.reviewNote,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      source: HistoryRecordSourceDto.from(source),
    };
  }
}
