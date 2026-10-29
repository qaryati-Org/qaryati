import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Governorate } from './governorate.entity';
import { Municipality } from './municipality.entity';

// Village identity. Other modules (population, geography, heritage…)
// reference a village by `village_id` and own their tables.
// Constraint names match the migrations so `migration:generate` sees no drift.
@Entity('villages')
@Unique('uq_villages_governorate_name_ar', ['governorate', 'nameAr'])
export class Village extends BaseEntity {
  @Column({ name: 'name_ar', length: 150 })
  nameAr!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150, nullable: true })
  nameEn!: string | null;

  // Documented meaning or origin of the village name, when known.
  @Column({ name: 'name_origin', type: 'text', nullable: true })
  nameOrigin!: string | null;

  @ManyToOne(() => Governorate, (g) => g.villages, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'governorate_id',
    foreignKeyConstraintName: 'villages_governorate_id_fkey',
  })
  governorate!: Governorate;

  @Column({ name: 'governorate_id' })
  governorateId!: string;

  // Composite FK (municipality_id, governorate_id): the database itself
  // guarantees a village's municipality is in the village's governorate.
  // Write through `municipalityId` / `governorateId`, never by assigning
  // `municipality = null`, which would also null the shared governorate_id.
  @ManyToOne(() => Municipality, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'municipality_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'villages_municipality_same_governorate_fkey',
    },
    { name: 'governorate_id', referencedColumnName: 'governorateId' },
  ])
  municipality!: Municipality | null;

  @Index('idx_villages_municipality_id')
  @Column({ name: 'municipality_id', type: 'uuid', nullable: true })
  municipalityId!: string | null;
}
