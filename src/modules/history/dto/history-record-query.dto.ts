import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { VerificationStatus } from '../../source';
import { HistoryRecordType } from '../entities/history-record.entity';

export class HistoryRecordQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: VerificationStatus,
    default: VerificationStatus.VERIFIED,
  })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @ApiPropertyOptional({ enum: HistoryRecordType })
  @IsOptional()
  @IsEnum(HistoryRecordType)
  type?: HistoryRecordType;

  @ApiPropertyOptional({ enum: ['startYear'], default: 'startYear' })
  @IsOptional()
  @IsIn(['startYear'])
  declare sort?: 'startYear';

  @ApiPropertyOptional({ enum: ['asc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc'])
  declare order: 'asc';
}
