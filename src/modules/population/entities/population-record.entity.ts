import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { VerifiableEntity } from '../../source';

// One population figure for one village in one reference year, taken from one
// source. A village has many records over time, and sources can disagree about
// the same year, so conflicting figures are separate records, never overwrites.
// Constraint names match the migration so `migration:generate` sees no drift.
@Entity('population_records')
// 0 is valid: a depopulated village still has a documented figure.
@Check('chk_population_records_value_non_negative', '"value" >= 0')
@Check(
  'chk_population_records_year_range',
  '"reference_year" BETWEEN 1 AND 2100',
)
// The same figure from the same source is never stored twice. The index behind
// this constraint also serves lookups by village and year.
@Unique('uq_population_records_village_year_value_source', [
  'villageId',
  'referenceYear',
  'value',
  'sourceId',
])
// At most one VERIFIED figure per village and year: if two verified values
// disagreed, readers could not know which one to trust.
@Index(
  'uq_population_records_verified_village_year',
  ['villageId', 'referenceYear'],
  { unique: true, where: `"status" = 'VERIFIED'` },
)
export class PopulationRecord extends VerifiableEntity {
  // Related by entity name so this module never imports another module's
  // entity (ADR-001). The foreign keys are enforced by the database.
  @ManyToOne('Village', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'village_id',
    foreignKeyConstraintName: 'population_records_village_id_fkey',
  })
  village?: unknown;

  @Column({ name: 'village_id', type: 'uuid' })
  villageId!: string;

  @ManyToOne('Source', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'source_id',
    foreignKeyConstraintName: 'population_records_source_id_fkey',
  })
  source?: unknown;

  // Indexed so deleting a source can find the records that reference it.
  @Index('idx_population_records_source_id')
  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  // The reviewer. The column (reviewed_by_id) comes from VerifiableEntity;
  // the foreign key is declared here so each table names its own constraint.
  @ManyToOne('User', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reviewed_by_id',
    foreignKeyConstraintName: 'population_records_reviewed_by_id_fkey',
  })
  reviewedBy?: unknown;

  @Column({ type: 'integer' })
  value!: number;

  @Column({ name: 'reference_year', type: 'integer' })
  referenceYear!: number;
}
