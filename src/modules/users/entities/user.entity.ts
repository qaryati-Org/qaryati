import { Check, Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../auth/enums/role.enum';

// Constraint names match the migration so `migration:generate` sees no drift.
@Entity('users')
@Unique('uq_users_email', ['email'])
// Emails are stored lowercased so the unique constraint is case-insensitive.
@Check('chk_users_email_lowercase', '"email" = lower("email")')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  // Never loaded unless asked for explicitly (UsersService.findByEmail with
  // withPassword), so it cannot leak into a response by accident.
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName!: string;

  @Column({
    type: 'enum',
    enum: Role,
    enumName: 'user_role',
    default: Role.VIEWER,
  })
  role!: Role;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
