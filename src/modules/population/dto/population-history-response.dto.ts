import { ApiProperty } from '@nestjs/swagger';

export interface PopulationHistorySqlRow {
  id: string;
  villageId: string;
  sourceId: string;
  referenceYear: number | string;
  value: number | string;
  previousReferenceYear: number | string | null;
  previousValue: number | string | null;
  populationChange: number | string | null;
}

export interface PopulationHistoryQueryResult {
  total: number | string;
  rows: PopulationHistorySqlRow[];
}

export interface PopulationHistorySourceData {
  id: string;
  title: string;
  type: string;
  author: string | null;
  url: string | null;
  year: number | null;
}

export class PopulationHistorySourceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Source type' })
  type!: string;

  @ApiProperty({ nullable: true, type: String })
  author!: string | null;

  @ApiProperty({ nullable: true, type: String })
  url!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Publication year',
  })
  year!: number | null;

  static from(source: PopulationHistorySourceData): PopulationHistorySourceDto {
    return {
      id: source.id,
      title: source.title,
      type: source.type,
      author: source.author,
      url: source.url,
      year: source.year,
    };
  }
}

export class PopulationHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  villageId!: string;

  @ApiProperty()
  referenceYear!: number;

  @ApiProperty()
  value!: number;

  @ApiProperty({ nullable: true, type: Number })
  previousReferenceYear!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  previousValue!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  populationChange!: number | null;

  @ApiProperty({ type: PopulationHistorySourceDto })
  source!: PopulationHistorySourceDto;

  static from(
    row: PopulationHistorySqlRow,
    source: PopulationHistorySourceData,
  ): PopulationHistoryResponseDto {
    return {
      id: row.id,
      villageId: row.villageId,
      referenceYear: Number(row.referenceYear),
      value: Number(row.value),
      previousReferenceYear: numberOrNull(row.previousReferenceYear),
      previousValue: numberOrNull(row.previousValue),
      populationChange: numberOrNull(row.populationChange),
      source: PopulationHistorySourceDto.from(source),
    };
  }
}

function numberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}
