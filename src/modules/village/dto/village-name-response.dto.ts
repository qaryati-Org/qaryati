import { ApiProperty } from '@nestjs/swagger';
import { VillageName, VillageNameType } from '../entities/village-name.entity';

export class VillageNameResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) villageId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: VillageNameType }) type!: VillageNameType;
  @ApiProperty({ example: 'en' }) language!: string;
  @ApiProperty({ nullable: true, type: String }) period!: string | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  sourceId!: string | null;
  @ApiProperty() createdAt!: Date;

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
