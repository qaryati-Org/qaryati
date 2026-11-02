import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CreateSourceDto } from './create-source.dto';
import { SourceType } from '../entities/source.entity';

export class UpdateSourceDto extends PartialType(
  OmitType(CreateSourceDto, ['title', 'type'] as const),
) {
  // Validate explicit nulls too; title and type are non-nullable in the database.
  @ApiPropertyOptional({ maxLength: 255, example: 'Census of Palestine 1997' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ enum: SourceType, example: SourceType.BOOK })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(SourceType)
  type?: SourceType;
}
