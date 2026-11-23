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
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty({ type: GovernorateResponseDto })
  governorate!: GovernorateResponseDto;
  @ApiProperty({ description: 'The name that matched the search text' })
  matchedName!: string;
  @ApiProperty({
    enum: MATCHED_BY,
    description: 'Which name matched: current Arabic/English or an alternative',
  })
  matchedBy!: MatchedBy;
  @ApiProperty({
    enum: ['EXACT', 'PREFIX', 'CONTAINS'],
    description: 'How the name matched',
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
