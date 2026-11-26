import { ApiProperty } from '@nestjs/swagger';
import { VerificationStatus } from '../../source';
import { Landmark, LandmarkType } from '../entities/landmark.entity';

export interface LandmarkSourceData {
  id: string;
  title: string;
  type: string;
  author: string | null;
  url: string | null;
  year: number | null;
}

export class LandmarkSourceDto {
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

  static from(source: LandmarkSourceData): LandmarkSourceDto {
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

export class LandmarkResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  villageId!: string;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty({ maxLength: 255 })
  name!: string;

  @ApiProperty({ enum: LandmarkType })
  type!: LandmarkType;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: VerificationStatus })
  status!: VerificationStatus;

  @ApiProperty({ nullable: true, type: Date })
  reviewedAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  reviewedById!: string | null;

  @ApiProperty({ nullable: true, type: String })
  reviewNote!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: LandmarkSourceDto })
  source!: LandmarkSourceDto;

  static from(
    landmark: Landmark,
    source: LandmarkSourceData,
  ): LandmarkResponseDto {
    return {
      id: landmark.id,
      villageId: landmark.villageId,
      sourceId: landmark.sourceId,
      name: landmark.name,
      type: landmark.type,
      description: landmark.description,
      status: landmark.status,
      reviewedAt: landmark.reviewedAt,
      reviewedById: landmark.reviewedById,
      reviewNote: landmark.reviewNote,
      createdAt: landmark.createdAt,
      updatedAt: landmark.updatedAt,
      source: LandmarkSourceDto.from(source),
    };
  }
}
