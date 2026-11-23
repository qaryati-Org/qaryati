import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  NAME_MAX_LENGTH,
  NAME_ORIGIN_MAX_LENGTH,
  trim,
} from './create-village.dto';

// Every field is optional. nameAr and governorateId reject null (they are
// required columns); nameEn, nameOrigin and municipalityId can be cleared
// with null.
export class UpdateVillageDto {
  @ApiPropertyOptional({ maxLength: NAME_MAX_LENGTH })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  nameAr?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NAME_MAX_LENGTH,
    description: 'Send null to clear the English name',
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
    description: 'Send null to clear the name origin',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_ORIGIN_MAX_LENGTH)
  nameOrigin?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Moving a village that has a municipality also needs municipalityId (a municipality in the new governorate, or null)',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  governorateId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Send null to detach the village from its municipality',
  })
  @IsOptional()
  @IsUUID()
  municipalityId?: string | null;
}
