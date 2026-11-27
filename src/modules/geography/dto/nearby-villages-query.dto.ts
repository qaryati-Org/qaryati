import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, Max, Min } from 'class-validator';

export class NearbyVillagesQueryDto {
  @ApiPropertyOptional({
    type: Number,
    default: 10,
    minimum: 0,
    exclusiveMinimum: true,
    maximum: 100,
    description: 'Search radius in kilometers',
  })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(0)
  @Max(100)
  radius = 10;
}
