import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { CulturalTraitType } from '../entities/cultural-trait.entity';

export class CulturalTraitQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CulturalTraitType })
  @IsOptional()
  @IsEnum(CulturalTraitType)
  type?: CulturalTraitType;

  @ApiPropertyOptional({ enum: ['name'], default: 'name' })
  @IsOptional()
  @IsIn(['name'])
  declare sort?: 'name';

  @ApiPropertyOptional({ enum: ['asc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc'])
  declare order: 'asc';
}
