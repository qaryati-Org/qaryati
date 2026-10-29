import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { MunicipalityType } from '../entities/municipality.entity';

export const MUNICIPALITY_SORT_FIELDS = ['nameAr', 'nameEn', 'type'] as const;
export type MunicipalitySortField = (typeof MUNICIPALITY_SORT_FIELDS)[number];

export class MunicipalityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in Arabic or English name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  governorateId?: string;

  @ApiPropertyOptional({ enum: MunicipalityType })
  @IsOptional()
  @IsEnum(MunicipalityType)
  type?: MunicipalityType;

  @ApiPropertyOptional({ enum: MUNICIPALITY_SORT_FIELDS, default: 'nameAr' })
  @IsOptional()
  @IsIn(MUNICIPALITY_SORT_FIELDS)
  declare sort?: MunicipalitySortField;
}
