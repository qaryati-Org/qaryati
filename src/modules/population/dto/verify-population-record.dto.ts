import { ApiPropertyOptional } from '@nestjs/swagger';
import { ValidateIf, IsString, MaxLength } from 'class-validator';

export class VerifyPopulationRecordDto {
  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Optional note from the reviewer.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
