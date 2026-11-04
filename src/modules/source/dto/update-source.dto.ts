import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { SourceType } from '../entities/source.entity';

// PATCH rules differ from POST; title and type reject explicit null; author, url and year can be cleared with null.
export class UpdateSourceDto {
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

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 255,
    description: 'Send null to clear the author',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  author?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Send null to clear the URL',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 2100,
    description: 'Send null to clear the year',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2100)
  year?: number | null;
}
