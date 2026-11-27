import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditAction {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

// One row per inserted, updated or deleted row of an audited table. Rows are
// written by the audit_log_row() database trigger, never by the application,
// and are never changed afterwards, so this entity does not extend
// BaseEntity (no updated_at).
// Index names match the migration so `migration:generate` sees no drift.
@Entity('audit_logs')
@Index('idx_audit_logs_record', ['tableName', 'recordId', 'createdAt'])
@Index('idx_audit_logs_actor', ['actorId', 'createdAt'])
@Index('idx_audit_logs_created_at', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'table_name', type: 'varchar', length: 63 })
  tableName!: string;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId!: string;

  @Column({ type: 'enum', enum: AuditAction, enumName: 'audit_action' })
  action!: AuditAction;

  // The authenticated user, or null for changes made outside a request
  // (migrations, seeds, the initial admin) or by an anonymous caller.
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  correlationId!: string | null;

  @Column({ name: 'old_data', type: 'jsonb', nullable: true })
  oldData!: Record<string, unknown> | null;

  @Column({ name: 'new_data', type: 'jsonb', nullable: true })
  newData!: Record<string, unknown> | null;

  @Column({
    name: 'changed_columns',
    type: 'text',
    array: true,
    nullable: true,
  })
  changedColumns!: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
