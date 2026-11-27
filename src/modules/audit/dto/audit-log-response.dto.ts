import { ApiProperty } from '@nestjs/swagger';
import { AuditAction, AuditLog } from '../entities/audit-log.entity';

export class AuditLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'landmarks' }) tableName!: string;
  @ApiProperty() recordId!: string;
  @ApiProperty({ enum: AuditAction }) action!: AuditAction;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'User who made the change; null outside a request',
  })
  actorId!: string | null;
  @ApiProperty({ nullable: true, type: String }) correlationId!: string | null;
  @ApiProperty({
    nullable: true,
    type: Object,
    description: 'Row before the change (null for INSERT)',
  })
  oldData!: Record<string, unknown> | null;
  @ApiProperty({
    nullable: true,
    type: Object,
    description: 'Row after the change (null for DELETE)',
  })
  newData!: Record<string, unknown> | null;
  @ApiProperty({
    nullable: true,
    type: [String],
    description: 'Changed columns (UPDATE only)',
  })
  changedColumns!: string[] | null;
  @ApiProperty() createdAt!: Date;

  static from(log: AuditLog): AuditLogResponseDto {
    return {
      id: log.id,
      tableName: log.tableName,
      recordId: log.recordId,
      action: log.action,
      actorId: log.actorId,
      correlationId: log.correlationId,
      oldData: log.oldData,
      newData: log.newData,
      changedColumns: log.changedColumns,
      createdAt: log.createdAt,
    };
  }
}
