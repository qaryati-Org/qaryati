import { ApiProperty } from '@nestjs/swagger';
import {
  Municipality,
  MunicipalityType,
} from '../entities/municipality.entity';
import { GovernorateResponseDto } from './governorate-response.dto';

// Short form embedded in village responses.
export class MunicipalitySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ enum: MunicipalityType }) type!: MunicipalityType;

  static from(municipality: Municipality): MunicipalitySummaryDto {
    return {
      id: municipality.id,
      nameAr: municipality.nameAr,
      nameEn: municipality.nameEn,
      type: municipality.type,
    };
  }
}

export class MunicipalityResponseDto extends MunicipalitySummaryDto {
  @ApiProperty({ type: GovernorateResponseDto })
  governorate!: GovernorateResponseDto;

  static from(municipality: Municipality): MunicipalityResponseDto {
    return {
      ...MunicipalitySummaryDto.from(municipality),
      governorate: GovernorateResponseDto.from(municipality.governorate),
    };
  }
}
