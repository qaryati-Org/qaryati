import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Governorate } from './governorate.entity';

// The two kinds of local government body in Palestine.
export enum MunicipalityType {
  MUNICIPALITY = 'MUNICIPALITY',
  VILLAGE_COUNCIL = 'VILLAGE_COUNCIL',
}

// Constraint names match the migration so `migration:generate` sees no drift.
@Entity('municipalities')
@Unique('uq_municipalities_governorate_name_ar', ['governorate', 'nameAr'])
// Target of the composite FK from villages (municipality_id, governorate_id),
// which guarantees a village's municipality is in the village's governorate.
@Unique('uq_municipalities_id_governorate', ['id', 'governorateId'])
export class Municipality extends BaseEntity {
  @Column({ name: 'name_ar', length: 150 })
  nameAr!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150, nullable: true })
  nameEn!: string | null;

  @Column({
    type: 'enum',
    enum: MunicipalityType,
    enumName: 'municipality_type',
  })
  type!: MunicipalityType;

  @ManyToOne(() => Governorate, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'governorate_id',
    foreignKeyConstraintName: 'municipalities_governorate_id_fkey',
  })
  governorate!: Governorate;

  @Column({ name: 'governorate_id' })
  governorateId!: string;
}
