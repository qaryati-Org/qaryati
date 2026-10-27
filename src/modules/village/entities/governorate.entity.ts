import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Village } from './village.entity';

@Entity('governorates')
export class Governorate extends BaseEntity {
  @Column({ name: 'name_ar', length: 100, unique: true })
  nameAr!: string;

  @Column({ name: 'name_en', length: 100, unique: true })
  nameEn!: string;

  @OneToMany(() => Village, (village) => village.governorate)
  villages?: Village[];
}
