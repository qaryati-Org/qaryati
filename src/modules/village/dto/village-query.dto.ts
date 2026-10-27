import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export const VILLAGE_SORT_FIELDS = ['nameAr', 'nameEn', 'createdAt'] as const;
export type VillageSortField = (typeof VILLAGE_SORT_FIELDS)[number];

export class VillageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in Arabic or English name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  governorateId?: string;

  @ApiPropertyOptional({ enum: VILLAGE_SORT_FIELDS, default: 'nameAr' })
  @IsOptional()
  @IsIn(VILLAGE_SORT_FIELDS)
  declare sort?: VillageSortField;
}
