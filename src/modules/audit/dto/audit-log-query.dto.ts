import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { AuditAction } from '../entities/audit-log.entity';

export const AUDIT_SORT_FIELDS = ['createdAt'] as const;

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Table name, e.g. landmarks or population_records',
    example: 'landmarks',
  })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Matches(/^[a-z_]+$/, { message: 'tableName must be a snake_case name' })
  tableName?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id of the changed row' })
  @IsOptional()
  @IsUUID()
  recordId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'User who made it' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ format: 'date-time', description: 'From (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'To (exclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: AUDIT_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(AUDIT_SORT_FIELDS)
  declare sort?: (typeof AUDIT_SORT_FIELDS)[number];

  // Newest first unless asked otherwise.
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
