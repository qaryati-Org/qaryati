import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { MAX_POPULATION } from './create-population-record.dto';

export class UpdatePopulationRecordDto {
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_POPULATION, example: 1200 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_POPULATION)
  value?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 2100, example: 1997 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2100)
  referenceYear?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000001',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  sourceId?: string;
}
