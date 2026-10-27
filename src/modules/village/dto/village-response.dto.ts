import { ApiProperty } from '@nestjs/swagger';
import { Village } from '../entities/village.entity';

export class GovernorateSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
}

// Entities never leave the service layer; responses are mapped explicitly.
export class VillageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ type: GovernorateSummaryDto })
  governorate!: GovernorateSummaryDto;

  static from(village: Village): VillageResponseDto {
    return {
      id: village.id,
      nameAr: village.nameAr,
      nameEn: village.nameEn,
      governorate: {
        id: village.governorate.id,
        nameAr: village.governorate.nameAr,
        nameEn: village.governorate.nameEn,
      },
    };
  }
}
