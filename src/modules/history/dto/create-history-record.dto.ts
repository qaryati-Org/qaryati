import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { HistoryRecordType } from '../entities/history-record.entity';

export class CreateHistoryRecordDto {
  @ApiProperty({ enum: HistoryRecordType })
  @IsEnum(HistoryRecordType)
  type!: HistoryRecordType;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'title must contain a non-whitespace character' })
  @MaxLength(255)
  title!: string;

  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'description must contain a non-whitespace character',
  })
  @MaxLength(10000)
  description!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceId!: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    maximum: 2100,
    description:
      'Optional year; negative values represent BCE and zero is invalid.',
  })
  @IsOptional()
  @IsInt()
  @NotEquals(0)
  @Max(2100)
  startYear?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    maximum: 2100,
    description:
      'Requires startYear when provided; negative values represent BCE.',
  })
  @IsOptional()
  @IsInt()
  @NotEquals(0)
  @Max(2100)
  endYear?: number | null;
}
