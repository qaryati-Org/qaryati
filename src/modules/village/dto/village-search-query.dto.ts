import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { trim } from './create-village.dto';

export class VillageSearchQueryDto extends PaginationQueryDto {
  @ApiProperty({
    minLength: 2,
    maxLength: 100,
    example: 'برقة',
    description:
      'Searched in the Arabic, English and alternative names. Arabic letter variants (أ/إ/آ/ا, ة/ه, ى/ي) and Latin case are ignored.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  governorateId?: string;

  // Results are always ordered by relevance (exact, then prefix, then
  // contains), so the only accepted value is "relevance".
  @ApiPropertyOptional({ enum: ['relevance'], default: 'relevance' })
  @IsOptional()
  @IsIn(['relevance'])
  declare sort?: 'relevance';
}
