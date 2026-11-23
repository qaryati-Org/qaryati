import { ApiProperty } from '@nestjs/swagger';
import { VerificationStatus } from '../../source';
import { PopulationRecord } from '../entities/population-record.entity';

export class PopulationRecordResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  villageId!: string;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty()
  value!: number;

  @ApiProperty()
  referenceYear!: number;

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

  static from(record: PopulationRecord): PopulationRecordResponseDto {
    return {
      id: record.id,
      villageId: record.villageId,
      sourceId: record.sourceId,
      value: record.value,
      referenceYear: record.referenceYear,
      status: record.status,
      reviewedAt: record.reviewedAt,
      reviewedById: record.reviewedById,
      reviewNote: record.reviewNote,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
