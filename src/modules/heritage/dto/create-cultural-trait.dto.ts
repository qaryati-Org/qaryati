import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CulturalTraitType } from '../entities/cultural-trait.entity';

export class CreateCulturalTraitDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: CulturalTraitType })
  @IsEnum(CulturalTraitType)
  type!: CulturalTraitType;

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
