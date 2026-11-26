import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { LandmarkType } from '../entities/landmark.entity';

export class CreateLandmarkDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: LandmarkType })
  @IsEnum(LandmarkType)
  type!: LandmarkType;

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
}
