import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Governorate } from './governorate.entity';

// Minimal village identity. Other modules (population, geography, heritage…)
// reference a village by `village_id` and own their tables; this entity
// grows with alternative names, name origin and municipality later.
@Entity('villages')
@Index(['governorate', 'nameAr'], { unique: true })
export class Village extends BaseEntity {
  @Column({ name: 'name_ar', length: 150 })
  nameAr!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150, nullable: true })
  nameEn!: string | null;

  @ManyToOne(() => Governorate, (g) => g.villages, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'governorate_id' })
  governorate!: Governorate;

  @Column({ name: 'governorate_id' })
  governorateId!: string;
}
