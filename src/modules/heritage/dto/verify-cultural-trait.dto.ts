import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

export class VerifyCulturalTraitDto {
  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Optional note from the reviewer.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
