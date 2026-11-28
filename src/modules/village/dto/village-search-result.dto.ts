import { ApiProperty } from '@nestjs/swagger';
import { VillageNameType } from '../entities/village-name.entity';
import { GovernorateResponseDto } from './governorate-response.dto';

export const MATCHED_BY = [
  'NAME_AR',
  'NAME_EN',
  ...Object.values(VillageNameType),
] as const;
export type MatchedBy = (typeof MATCHED_BY)[number];

// One row as returned by VILLAGE_SEARCH_SQL.
export interface VillageSearchRow {
  id: string;
  nameAr: string;
  nameEn: string | null;
  governorate: GovernorateResponseDto;
  matchedName: string;
  matchedBy: MatchedBy;
  rank: number;
}

export class VillageSearchResultDto {
  @ApiProperty({
    format: 'uuid',
    example: 'dcb3e6f5-5918-4f90-a821-452873eb79ff',
  })
  id!: string;
  @ApiProperty({ example: 'برقة' }) nameAr!: string;
  @ApiProperty({ nullable: true, type: String, example: 'Burqa' })
  nameEn!: string | null;
  @ApiProperty({ type: GovernorateResponseDto })
  governorate!: GovernorateResponseDto;
  @ApiProperty({
    description: 'The name that matched the search text',
    example: 'Burqa',
  })
  matchedName!: string;
  @ApiProperty({
    enum: MATCHED_BY,
    description: 'Which name matched: current Arabic/English or an alternative',
    example: 'NAME_EN',
  })
  matchedBy!: MatchedBy;
  @ApiProperty({
    enum: ['EXACT', 'PREFIX', 'CONTAINS'],
    description: 'How the name matched',
    example: 'EXACT',
  })
  match!: 'EXACT' | 'PREFIX' | 'CONTAINS';

  static from(row: VillageSearchRow): VillageSearchResultDto {
    return {
      id: row.id,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      governorate: row.governorate,
      matchedName: row.matchedName,
      matchedBy: row.matchedBy,
      match: row.rank === 0 ? 'EXACT' : row.rank === 1 ? 'PREFIX' : 'CONTAINS',
    };
  }
}
