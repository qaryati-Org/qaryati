import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, Paginated } from '../../common/pagination/paginated';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { AuditLog } from './entities/audit-log.entity';

// Read side only: audit rows are written by the database trigger.
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
  ) {}

  async findAll(
    query: AuditLogQueryDto,
  ): Promise<Paginated<AuditLogResponseDto>> {
    const qb = this.logs.createQueryBuilder('a');

    if (query.tableName) {
      qb.andWhere('a.tableName = :tableName', { tableName: query.tableName });
    }
    if (query.recordId) {
      qb.andWhere('a.recordId = :recordId', { recordId: query.recordId });
    }
    if (query.actorId) {
      qb.andWhere('a.actorId = :actorId', { actorId: query.actorId });
    }
    if (query.action) {
      qb.andWhere('a.action = :action', { action: query.action });
    }
    if (query.from) {
      qb.andWhere('a.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('a.createdAt < :to', { to: query.to });
    }

    const direction = query.order === 'asc' ? 'ASC' : 'DESC';
    const [rows, total] = await qb
      .orderBy('a.createdAt', direction)
      .addOrderBy('a.id', direction)
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    return paginate(
      rows.map((row) => AuditLogResponseDto.from(row)),
      total,
      query,
    );
  }
}
