import { ApiProperty } from '@nestjs/swagger';
import { Source, SourceType } from '../entities/source.entity';

export class SourceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: SourceType })
  type!: SourceType;

  @ApiProperty({ nullable: true, type: String })
  author!: string | null;

  @ApiProperty({ nullable: true, type: String })
  url!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  year!: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static from(source: Source): SourceResponseDto {
    return {
      id: source.id,
      title: source.title,
      type: source.type,
      author: source.author,
      url: source.url,
      year: source.year,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
  }
}
