import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  BeforeQueryEvent,
  DataSource,
  EntitySubscriberInterface,
} from 'typeorm';
import { currentAuditContext } from './audit-context';

// INSERT / UPDATE / DELETE statements, which may fire an audit trigger.
const WRITE_STATEMENT = /^\s*(INSERT|UPDATE|DELETE)\b/i;
// Writes to tables without an audit trigger: skip the extra round trip, so
// login (which inserts a refresh token) stays as fast as before.
const UNAUDITED_WRITE =
  /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(refresh_tokens|audit_logs)"?/i;

export const SET_AUDIT_CONTEXT_SQL =
  "SELECT set_config('qaryati.actor_id', $1, false), " +
  "set_config('qaryati.correlation_id', $2, false)";

interface PgConnection {
  query(sql: string, parameters: unknown[]): Promise<unknown>;
}

// Tells PostgreSQL who is writing, right before each write and on the same
// connection, so the audit_log_row() trigger can record it. TypeORM calls
// beforeQuery for every query, including raw dataSource.query() calls.
//
// The settings are session-level because most writes do not run in a
// transaction. They are overwritten before every write (with '' when there
// is no user), so a pooled connection never carries an old caller into the
// next request's write.
@Injectable()
export class AuditActorSubscriber implements EntitySubscriberInterface {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  async beforeQuery(event: BeforeQueryEvent<unknown>): Promise<void> {
    if (
      !WRITE_STATEMENT.test(event.query) ||
      UNAUDITED_WRITE.test(event.query)
    ) {
      return;
    }
    // The connection the write is about to use. Querying it directly
    // (not through the query runner) avoids triggering beforeQuery again.
    const connection = (
      event.queryRunner as unknown as { databaseConnection?: PgConnection }
    ).databaseConnection;
    if (!connection) return;

    const context = currentAuditContext();
    await connection.query(SET_AUDIT_CONTEXT_SQL, [
      context?.actorId ?? '',
      context?.correlationId ?? '',
    ]);
  }
}
