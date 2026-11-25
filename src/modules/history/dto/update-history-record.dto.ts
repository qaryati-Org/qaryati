import { ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';
import { HistoryRecordType } from '../entities/history-record.entity';

export class UpdateHistoryRecordDto {
  @ApiPropertyOptional({ enum: HistoryRecordType })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(HistoryRecordType)
  type?: HistoryRecordType;

  @ApiPropertyOptional({ maxLength: 255 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'title must contain a non-whitespace character' })
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, {
    message: 'description must contain a non-whitespace character',
  })
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  sourceId?: string;

  // Like optional Source fields, years may be explicitly cleared with null.
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    maximum: 2100,
    description:
      'Send null to clear; negative values represent BCE and zero is invalid.',
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
      'Send null to clear; negative values represent BCE and zero is invalid.',
  })
  @IsOptional()
  @IsInt()
  @NotEquals(0)
  @Max(2100)
  endYear?: number | null;
}
