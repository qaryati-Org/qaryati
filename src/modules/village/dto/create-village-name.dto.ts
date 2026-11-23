import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { VillageNameType } from '../entities/village-name.entity';
import { NAME_MAX_LENGTH, trim } from './create-village.dto';

export class CreateVillageNameDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH, example: 'Burka' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({ enum: VillageNameType })
  @IsEnum(VillageNameType)
  type!: VillageNameType;

  @ApiProperty({
    description: 'ISO 639-1 language code',
    example: 'en',
    pattern: '^[a-z]{2}$',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z]{2}$/, {
    message: 'language must be a two-letter ISO 639-1 code, e.g. "ar" or "en"',
  })
  language!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
    example: 'Ottoman period',
    description: 'When the name was used',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  period?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Source that documents this name',
  })
  @IsOptional()
  @IsUUID()
  sourceId?: string | null;
}
