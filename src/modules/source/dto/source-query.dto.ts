import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { SourceType } from '../entities/source.entity';

export const SOURCE_SORT_FIELDS = [
  'title',
  'type',
  'year',
  'createdAt',
] as const;
export type SourceSortField = (typeof SOURCE_SORT_FIELDS)[number];

export class SourceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in title or author' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: SourceType })
  @IsOptional()
  @IsEnum(SourceType)
  type?: SourceType;

  @ApiPropertyOptional({ minimum: 1, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ enum: SOURCE_SORT_FIELDS, default: 'title' })
  @IsOptional()
  @IsIn(SOURCE_SORT_FIELDS)
  declare sort?: SourceSortField;
}
