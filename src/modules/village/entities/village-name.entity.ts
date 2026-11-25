import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Village } from './village.entity';

export enum VillageNameType {
  // Another way of writing the current name, e.g. "Burqa" / "Burka".
  ALTERNATIVE_SPELLING = 'ALTERNATIVE_SPELLING',
  // The name written in another script, e.g. Latin letters for an Arabic name.
  TRANSLITERATION = 'TRANSLITERATION',
  // A former name the village was known by in an earlier period.
  HISTORICAL = 'HISTORICAL',
}

// Other names a village is or was known by. The current names stay on the
// village itself (name_ar, name_en). Constraint names match the migration so
// `migration:generate` sees no drift.
@Entity('village_names')
// The same name is stored once per village. The index behind this
// constraint also serves "all names of a village" (village_id comes first).
@Unique('uq_village_names_village_name', ['villageId', 'name'])
// ISO 639-1 language code, e.g. "ar", "en", "he", "tr".
@Check('chk_village_names_language', `"language" ~ '^[a-z]{2}$'`)
export class VillageName extends BaseEntity {
  // Names are part of the village, so they are deleted with it (CASCADE).
  // Other modules' data (population, heritage…) blocks the delete instead.
  @ManyToOne(() => Village, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'village_id',
    foreignKeyConstraintName: 'village_names_village_id_fkey',
  })
  village?: Village;

  @Column({ name: 'village_id', type: 'uuid' })
  villageId!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({
    type: 'enum',
    enum: VillageNameType,
    enumName: 'village_name_type',
  })
  type!: VillageNameType;

  @Column({ type: 'varchar', length: 2 })
  language!: string;

  // When the name was used, in free text: "Ottoman period", "before 1948".
  @Column({ type: 'varchar', length: 100, nullable: true })
  period!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  // Where the name is documented. Related by entity name so the village
  // module never imports the source module's entity (ADR-001).
  @ManyToOne('Source', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'source_id',
    foreignKeyConstraintName: 'village_names_source_id_fkey',
  })
  source?: unknown;

  // Indexed so deleting a source can find the names that reference it.
  @Index('idx_village_names_source_id')
  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId!: string | null;
}
