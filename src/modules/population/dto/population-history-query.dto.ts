import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class PopulationHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['referenceYear'], default: 'referenceYear' })
  @IsOptional()
  @IsIn(['referenceYear'])
  declare sort?: 'referenceYear';

  @ApiPropertyOptional({ enum: ['asc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc'])
  declare order: 'asc';
}
