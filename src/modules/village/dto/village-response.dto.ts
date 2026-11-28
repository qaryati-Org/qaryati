import { ApiProperty } from '@nestjs/swagger';
import { Village } from '../entities/village.entity';
import { GovernorateResponseDto } from './governorate-response.dto';
import { MunicipalitySummaryDto } from './municipality-response.dto';

// Entities never leave the service layer; responses are mapped explicitly.
export class VillageResponseDto {
  @ApiProperty({ example: 'dcb3e6f5-5918-4f90-a821-452873eb79ff' })
  id!: string;
  @ApiProperty({ example: 'برقة' }) nameAr!: string;
  @ApiProperty({ nullable: true, type: String, example: 'Burqa' })
  nameEn!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Documented meaning or origin of the village name',
    example: null,
  })
  nameOrigin!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: -90,
    maximum: 90,
    description: 'Null until the village is geocoded',
    example: null,
  })
  latitude!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: -180,
    maximum: 180,
    description: 'Null until the village is geocoded',
    example: null,
  })
  longitude!: number | null;
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
      latitude: village.latitude,
      longitude: village.longitude,
      governorate: GovernorateResponseDto.from(village.governorate),
      municipality: village.municipality
        ? MunicipalitySummaryDto.from(village.municipality)
        : null,
    };
  }
}
