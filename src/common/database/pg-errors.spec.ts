import { QueryFailedError } from 'typeorm';
import { isForeignKeyViolation, isUniqueViolation } from './pg-errors';

function pgError(code: string, constraint?: string): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], { code, constraint } as never);
}

describe('pg-errors', () => {
  it('recognizes a unique violation, with or without a constraint name', () => {
    const error = pgError('23505', 'uq_villages_governorate_name_ar');

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(error, 'uq_villages_governorate_name_ar')).toBe(
      true,
    );
    expect(isUniqueViolation(error, 'uq_other')).toBe(false);
    expect(isForeignKeyViolation(error)).toBe(false);
  });

  it('recognizes a foreign key violation', () => {
    const error = pgError('23503', 'population_records_village_id_fkey');

    expect(isForeignKeyViolation(error)).toBe(true);
    expect(isUniqueViolation(error)).toBe(false);
  });

  it('ignores errors that are not database errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isForeignKeyViolation(undefined)).toBe(false);
  });
});
