import { ApiProperty } from '@nestjs/swagger';
import { Village } from '../entities/village.entity';
import { GovernorateResponseDto } from './governorate-response.dto';
import { MunicipalitySummaryDto } from './municipality-response.dto';

// Entities never leave the service layer; responses are mapped explicitly.
export class VillageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Documented meaning or origin of the village name',
  })
  nameOrigin!: string | null;
  @ApiProperty({ type: GovernorateResponseDto })
  governorate!: GovernorateResponseDto;
  @ApiProperty({ type: MunicipalitySummaryDto, nullable: true })
  municipality!: MunicipalitySummaryDto | null;

  static from(village: Village): VillageResponseDto {
    return {
      id: village.id,
      nameAr: village.nameAr,
      nameEn: village.nameEn,
      nameOrigin: village.nameOrigin,
      governorate: GovernorateResponseDto.from(village.governorate),
      municipality: village.municipality
        ? MunicipalitySummaryDto.from(village.municipality)
        : null,
    };
  }
}
