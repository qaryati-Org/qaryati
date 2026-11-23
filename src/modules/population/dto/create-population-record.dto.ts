import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export const MAX_POPULATION = 2_147_483_647;

export class CreatePopulationRecordDto {
  @ApiProperty({
    minimum: 0,
    maximum: MAX_POPULATION,
    example: 1200,
    description: 'Zero is valid for a documented depopulated village.',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_POPULATION)
  value!: number;

  @ApiProperty({
    minimum: 1,
    maximum: 2100,
    example: 1997,
    description:
      'Years after the current year are rejected by a separate service rule.',
  })
  @IsInt()
  @Min(1)
  @Max(2100)
  referenceYear!: number;

  @ApiProperty({
    format: 'uuid',
    example: '00000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  sourceId!: string;
}
