import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { VerifiableEntity } from '../../source';

export enum CulturalTraitType {
  CRAFT = 'CRAFT',
  FOOD = 'FOOD',
  FARMING_PRACTICE = 'FARMING_PRACTICE',
}

@Entity('cultural_traits')
@Index('idx_cultural_traits_village_id', ['villageId'])
@Index('idx_cultural_traits_source_id', ['sourceId'])
@Index('idx_cultural_traits_village_status_name_id', [
  'villageId',
  'status',
  'name',
  'id',
])
@Index('idx_cultural_traits_village_status_type_name_id', [
  'villageId',
  'status',
  'type',
  'name',
  'id',
])
export class CulturalTrait extends VerifiableEntity {
  @ManyToOne('Village', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'village_id',
    foreignKeyConstraintName: 'cultural_traits_village_id_fkey',
  })
  village?: unknown;

  @Column({ name: 'village_id', type: 'uuid' })
  villageId!: string;

  @ManyToOne('Source', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'source_id',
    foreignKeyConstraintName: 'cultural_traits_source_id_fkey',
  })
  source?: unknown;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @Column({
    type: 'enum',
    enum: CulturalTraitType,
    enumName: 'cultural_trait_type',
  })
  type!: CulturalTraitType;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @ManyToOne('User', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reviewed_by_id',
    foreignKeyConstraintName: 'cultural_traits_reviewed_by_id_fkey',
  })
  reviewedBy?: unknown;
}
