import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Names are trimmed so " برقة" and "برقة" count as the same village
// for the unique (governorate, name_ar) rule.
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const NAME_MAX_LENGTH = 150;
export const NAME_ORIGIN_MAX_LENGTH = 2000;

export class CreateVillageDto {
  @ApiProperty({ maxLength: NAME_MAX_LENGTH, example: 'برقة' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  nameAr!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NAME_MAX_LENGTH,
    example: 'Burqa',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  nameEn?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NAME_ORIGIN_MAX_LENGTH,
    description: 'Documented meaning or origin of the village name',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_ORIGIN_MAX_LENGTH)
  nameOrigin?: string | null;

  @ApiPropertyOptional({
    type: Number,
    minimum: -90,
    maximum: 90,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    type: Number,
    minimum: -180,
    maximum: 180,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  governorateId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Must belong to the same governorate as the village',
  })
  @IsOptional()
  @IsUUID()
  municipalityId?: string | null;
}
