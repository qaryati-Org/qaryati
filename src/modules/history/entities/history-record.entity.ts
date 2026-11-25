import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { VerifiableEntity } from '../../source';

export enum HistoryRecordType {
  OVERVIEW = 'OVERVIEW',
  EVENT = 'EVENT',
}

@Entity('history_records')
@Check(
  'chk_history_records_end_year_requires_start_year',
  '"end_year" IS NULL OR "start_year" IS NOT NULL',
)
@Check(
  'chk_history_records_start_year_not_zero',
  '"start_year" IS NULL OR "start_year" <> 0',
)
@Check(
  'chk_history_records_end_year_not_zero',
  '"end_year" IS NULL OR "end_year" <> 0',
)
@Check(
  'chk_history_records_start_year_max',
  '"start_year" IS NULL OR "start_year" <= 2100',
)
@Check(
  'chk_history_records_end_year_max',
  '"end_year" IS NULL OR "end_year" <= 2100',
)
@Check(
  'chk_history_records_year_order',
  '"start_year" IS NULL OR "end_year" IS NULL OR "start_year" <= "end_year"',
)
@Index('idx_history_records_village_id', ['villageId'])
@Index('uq_history_records_village_overview', ['villageId'], {
  unique: true,
  where: `"type" = 'OVERVIEW'`,
})
export class HistoryRecord extends VerifiableEntity {
  @ManyToOne('Village', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'village_id',
    foreignKeyConstraintName: 'history_records_village_id_fkey',
  })
  village?: unknown;

  @Column({ name: 'village_id', type: 'uuid' })
  villageId!: string;

  @ManyToOne('Source', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'source_id',
    foreignKeyConstraintName: 'history_records_source_id_fkey',
  })
  source?: unknown;

  @Index('idx_history_records_source_id')
  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @Column({
    type: 'enum',
    enum: HistoryRecordType,
    enumName: 'history_record_type',
  })
  type!: HistoryRecordType;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'start_year', type: 'integer', nullable: true })
  startYear!: number | null;

  @Column({ name: 'end_year', type: 'integer', nullable: true })
  endYear!: number | null;

  @ManyToOne('User', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reviewed_by_id',
    foreignKeyConstraintName: 'history_records_reviewed_by_id_fkey',
  })
  reviewedBy?: unknown;
}
