import { ApiProperty } from '@nestjs/swagger';
import {
  Municipality,
  MunicipalityType,
} from '../entities/municipality.entity';
import { GovernorateResponseDto } from './governorate-response.dto';

// Short form embedded in village responses.
export class MunicipalitySummaryDto {
  @ApiProperty({ example: '7c1f0a52-3d4e-4b8a-9f61-2e5d8c9b0a13' })
  id!: string;
  @ApiProperty({ example: 'مجلس قروي برقة' }) nameAr!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Burqa Village Council',
  })
  nameEn!: string | null;
  @ApiProperty({
    enum: MunicipalityType,
    example: MunicipalityType.VILLAGE_COUNCIL,
  })
  type!: MunicipalityType;

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
