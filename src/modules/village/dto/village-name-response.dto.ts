import { ApiProperty } from '@nestjs/swagger';
import { VillageName, VillageNameType } from '../entities/village-name.entity';

export class VillageNameResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: 'd4d2e55c-0a22-4d6c-ba6a-3768fb3beb4a',
  })
  id!: string;
  @ApiProperty({
    format: 'uuid',
    example: 'dcb3e6f5-5918-4f90-a821-452873eb79ff',
  })
  villageId!: string;
  @ApiProperty({ example: 'Burka' }) name!: string;
  @ApiProperty({
    enum: VillageNameType,
    example: VillageNameType.ALTERNATIVE_SPELLING,
  })
  type!: VillageNameType;
  @ApiProperty({ example: 'en' }) language!: string;
  @ApiProperty({ nullable: true, type: String, example: null })
  period!: string | null;
  @ApiProperty({ nullable: true, type: String, example: null })
  note!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid', example: null })
  sourceId!: string | null;
  @ApiProperty({ example: '2026-11-25T08:12:13.968Z' }) createdAt!: Date;

  static from(name: VillageName): VillageNameResponseDto {
    return {
      id: name.id,
      villageId: name.villageId,
      name: name.name,
      type: name.type,
      language: name.language,
      period: name.period,
      note: name.note,
      sourceId: name.sourceId,
      createdAt: name.createdAt,
    };
  }
}
