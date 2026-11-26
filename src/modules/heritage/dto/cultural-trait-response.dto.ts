import { ApiProperty } from '@nestjs/swagger';
import { VerificationStatus } from '../../source';
import { SourceResponseDto } from '../../source/dto/source-response.dto';
import {
  CulturalTrait,
  CulturalTraitType,
} from '../entities/cultural-trait.entity';

export class CulturalTraitSourceDto {
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

  static from(source: SourceResponseDto): CulturalTraitSourceDto {
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

export class CulturalTraitResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  villageId!: string;

  @ApiProperty({ format: 'uuid' })
  sourceId!: string;

  @ApiProperty({ maxLength: 255 })
  name!: string;

  @ApiProperty({ enum: CulturalTraitType })
  type!: CulturalTraitType;

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

  @ApiProperty({ type: CulturalTraitSourceDto })
  source!: CulturalTraitSourceDto;

  static from(
    culturalTrait: CulturalTrait,
    source: SourceResponseDto,
  ): CulturalTraitResponseDto {
    return {
      id: culturalTrait.id,
      villageId: culturalTrait.villageId,
      sourceId: culturalTrait.sourceId,
      name: culturalTrait.name,
      type: culturalTrait.type,
      description: culturalTrait.description,
      status: culturalTrait.status,
      reviewedAt: culturalTrait.reviewedAt,
      reviewedById: culturalTrait.reviewedById,
      reviewNote: culturalTrait.reviewNote,
      createdAt: culturalTrait.createdAt,
      updatedAt: culturalTrait.updatedAt,
      source: CulturalTraitSourceDto.from(source),
    };
  }
}
