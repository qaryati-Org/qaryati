import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { SourceType } from '../entities/source.entity';

export class CreateSourceDto {
  @ApiProperty({ maxLength: 255, example: 'Census of Palestine 1997' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ enum: SourceType, example: SourceType.BOOK })
  @IsEnum(SourceType)
  type!: SourceType;

  @ApiPropertyOptional({
    maxLength: 255,
    example: 'Palestinian Central Bureau of Statistics',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  author?: string;

  @ApiPropertyOptional({
    example: 'https://www.pcbs.gov.ps',
    description: 'Must use the HTTP or HTTPS protocol',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2100,
    example: 1997,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2100)
  year?: number;
}
