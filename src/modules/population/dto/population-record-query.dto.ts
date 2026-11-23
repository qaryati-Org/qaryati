import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { VerificationStatus } from '../../source';

export const POPULATION_SORT_FIELDS = [
  'referenceYear',
  'value',
  'createdAt',
] as const;
export type PopulationSortField = (typeof POPULATION_SORT_FIELDS)[number];

export class PopulationRecordQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({
    enum: POPULATION_SORT_FIELDS,
    default: 'referenceYear',
  })
  @IsOptional()
  @IsIn(POPULATION_SORT_FIELDS)
  declare sort?: PopulationSortField;
}
