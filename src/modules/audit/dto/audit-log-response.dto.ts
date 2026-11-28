import { ApiProperty } from '@nestjs/swagger';
import { AuditAction, AuditLog } from '../entities/audit-log.entity';

export class AuditLogResponseDto {
  @ApiProperty({ example: 'bd035e14-e335-4654-b756-65f80ca8f429' })
  id!: string;
  @ApiProperty({ example: 'landmarks' }) tableName!: string;
  @ApiProperty({ example: '1cbeb907-52a3-48d9-ad25-f656c0566a70' })
  recordId!: string;
  @ApiProperty({ enum: AuditAction, example: AuditAction.UPDATE })
  action!: AuditAction;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'User who made the change; null outside a request',
    example: '32556933-5931-450b-bdf2-721cea0b9744',
  })
  actorId!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    example: '2f9c1a7e-6b1d-4c2e-9a51-0d3f6c8b7e21',
  })
  correlationId!: string | null;
  @ApiProperty({
    nullable: true,
    type: Object,
    description: 'Row before the change (null for INSERT)',
    example: {
      name: 'Ain al-Balad',
      description: 'First text',
      status: 'PENDING',
    },
  })
  oldData!: Record<string, unknown> | null;
  @ApiProperty({
    nullable: true,
    type: Object,
    description: 'Row after the change (null for DELETE)',
    example: {
      name: 'Ain al-Balad',
      description: 'Corrected text',
      status: 'PENDING',
    },
  })
  newData!: Record<string, unknown> | null;
  @ApiProperty({
    nullable: true,
    type: [String],
    description: 'Changed columns (UPDATE only)',
    example: ['description'],
  })
  changedColumns!: string[] | null;
  @ApiProperty({ example: '2026-11-28T18:04:35.052Z' })
  createdAt!: Date;

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
