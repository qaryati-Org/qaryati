import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { LandmarkType } from '../entities/landmark.entity';

export class UpdateLandmarkDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: LandmarkType })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(LandmarkType)
  type?: LandmarkType;

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
}
