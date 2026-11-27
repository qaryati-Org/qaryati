import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditLogQueryDto } from './audit-log-query.dto';

describe('AuditLogQueryDto', () => {
  const errorsFor = async (query: Record<string, unknown>) => {
    const dto = plainToInstance(AuditLogQueryDto, query);
    const errors = await validate(dto);
    return { dto, fields: errors.map((e) => e.property) };
  };

  it('lists newest first by default', async () => {
    const { dto, fields } = await errorsFor({});
    expect(fields).toEqual([]);
    expect(dto.order).toBe('desc');
  });

  it('accepts all filters', async () => {
    const { fields } = await errorsFor({
      tableName: 'population_records',
      recordId: '00000000-0000-4000-8000-000000000001',
      actorId: '00000000-0000-4000-8000-000000000002',
      action: 'UPDATE',
      from: '2026-11-01T00:00:00Z',
      to: '2026-12-01',
    });
    expect(fields).toEqual([]);
  });

  it.each([
    ['tableName', 'landmarks; DROP TABLE users'],
    ['recordId', 'not-a-uuid'],
    ['action', 'TRUNCATE'],
    ['from', 'yesterday'],
    ['sort', 'actorId'],
  ])('rejects an invalid %s', async (field, value) => {
    const { fields } = await errorsFor({ [field]: value });
    expect(fields).toContain(field);
  });
});
