import { ApiProperty } from '@nestjs/swagger';
import { Governorate } from '../entities/governorate.entity';

export class GovernorateResponseDto {
  @ApiProperty({ example: 'e5fb5848-0ebc-48dd-8eab-51e57a191334' })
  id!: string;
  @ApiProperty({ example: 'نابلس' }) nameAr!: string;
  @ApiProperty({ example: 'Nablus' }) nameEn!: string;

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
