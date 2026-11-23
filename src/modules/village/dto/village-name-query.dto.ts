import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VillageNameType } from '../entities/village-name.entity';

export class VillageNameQueryDto {
  @ApiPropertyOptional({ enum: VillageNameType })
  @IsOptional()
  @IsEnum(VillageNameType)
  type?: VillageNameType;
}
