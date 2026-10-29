import { ApiProperty } from '@nestjs/swagger';
import { Governorate } from '../entities/governorate.entity';

export class GovernorateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;

  static from(governorate: Governorate): GovernorateResponseDto {
    return {
      id: governorate.id,
      nameAr: governorate.nameAr,
      nameEn: governorate.nameEn,
    };
  }
}

export class GovernorateListResponseDto {
  @ApiProperty({ type: [GovernorateResponseDto] })
  data!: GovernorateResponseDto[];
}
