import { QueryFailedError } from 'typeorm';

// PostgreSQL error codes the API translates into HTTP errors.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

interface PgDriverError {
  code?: unknown;
  constraint?: unknown;
}

function driverError(error: unknown): PgDriverError | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  const driver: unknown = error.driverError;
  // A non-null object can be read as PgDriverError: both fields are unknown.
  return typeof driver === 'object' && driver !== null ? driver : undefined;
}

function matches(
  error: unknown,
  code: string,
  constraint: string | undefined,
): boolean {
  const driver = driverError(error);
  if (driver?.code !== code) return false;
  return constraint === undefined || driver.constraint === constraint;
}

// True when a write broke a unique constraint (optionally a specific one,
// by the explicit name used in the migration).
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  return matches(error, PG_UNIQUE_VIOLATION, constraint);
}

// True when a write or delete broke a foreign key (optionally a specific one).
export function isForeignKeyViolation(
  error: unknown,
  constraint?: string,
): boolean {
  return matches(error, PG_FOREIGN_KEY_VIOLATION, constraint);
}
