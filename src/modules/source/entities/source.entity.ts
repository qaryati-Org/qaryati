import { Check, Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum SourceType {
  BOOK = 'BOOK',
  WEBSITE = 'WEBSITE',
  ARCHIVE = 'ARCHIVE',
  SURVEY = 'SURVEY',
  ORAL = 'ORAL',
  OTHER = 'OTHER',
}

// Constraint names match the migration so `migration:generate` sees no drift.
@Entity('sources')
@Check('chk_sources_year_range', '"year" BETWEEN 1 AND 2100')
export class Source extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({
    type: 'enum',
    enum: SourceType,
    enumName: 'source_type',
  })
  type!: SourceType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  author!: string | null;

  @Column({ type: 'text', nullable: true })
  url!: string | null;

  @Column({ type: 'integer', nullable: true })
  year!: number | null;
}
