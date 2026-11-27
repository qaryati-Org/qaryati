import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { VerifiableEntity } from '../../source';

export enum LandmarkType {
  SPRING = 'SPRING',
  RELIGIOUS_SITE = 'RELIGIOUS_SITE',
  ARCHAEOLOGICAL_SITE = 'ARCHAEOLOGICAL_SITE',
  OLD_BUILDING = 'OLD_BUILDING',
  VIEWPOINT = 'VIEWPOINT',
}

@Entity('landmarks')
@Index('idx_landmarks_village_id', ['villageId'])
@Index('idx_landmarks_source_id', ['sourceId'])
@Index('idx_landmarks_village_status_name_id', [
  'villageId',
  'status',
  'name',
  'id',
])
@Index('idx_landmarks_village_status_type_name_id', [
  'villageId',
  'status',
  'type',
  'name',
  'id',
])
export class Landmark extends VerifiableEntity {
  @ManyToOne('Village', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'village_id',
    foreignKeyConstraintName: 'landmarks_village_id_fkey',
  })
  village?: unknown;

  @Column({ name: 'village_id', type: 'uuid' })
  villageId!: string;

  @ManyToOne('Source', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'source_id',
    foreignKeyConstraintName: 'landmarks_source_id_fkey',
  })
  source?: unknown;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'enum',
    enum: LandmarkType,
    enumName: 'landmark_type',
  })
  type!: LandmarkType;

  @Column({ type: 'text' })
  description!: string;

  @ManyToOne('User', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reviewed_by_id',
    foreignKeyConstraintName: 'landmarks_reviewed_by_id_fkey',
  })
  reviewedBy?: unknown;
}
