import { BeforeQueryEvent, DataSource } from 'typeorm';
import { runWithAuditContext } from './audit-context';
import {
  AuditActorSubscriber,
  SET_AUDIT_CONTEXT_SQL,
} from './audit-actor.subscriber';

describe('AuditActorSubscriber', () => {
  let connection: { query: jest.Mock };
  let dataSource: { subscribers: unknown[] };
  let subscriber: AuditActorSubscriber;

  const eventFor = (query: string) =>
    ({
      query,
      queryRunner: { databaseConnection: connection },
    }) as unknown as BeforeQueryEvent<unknown>;

  beforeEach(() => {
    connection = { query: jest.fn().mockResolvedValue([]) };
    dataSource = { subscribers: [] };
    subscriber = new AuditActorSubscriber(dataSource as unknown as DataSource);
  });

  it('registers itself with the data source', () => {
    expect(dataSource.subscribers).toEqual([subscriber]);
  });

  it.each([
    'INSERT INTO "landmarks"("id") VALUES ($1)',
    'UPDATE "landmarks" SET "name" = $1 WHERE "id" = $2',
    'DELETE FROM "village_names" WHERE "id" = $1',
    '\n        UPDATE population_records\n         SET status = $1',
  ])('passes the caller to the connection before %s', async (sql) => {
    await runWithAuditContext({ actorId: 'u-1', correlationId: 'corr-1' }, () =>
      subscriber.beforeQuery(eventFor(sql)),
    );

    expect(connection.query).toHaveBeenCalledWith(SET_AUDIT_CONTEXT_SQL, [
      'u-1',
      'corr-1',
    ]);
  });

  it('clears the caller for writes outside a request', async () => {
    await subscriber.beforeQuery(
      eventFor('INSERT INTO "users"("id") VALUES ($1)'),
    );

    expect(connection.query).toHaveBeenCalledWith(SET_AUDIT_CONTEXT_SQL, [
      '',
      '',
    ]);
  });

  it.each([
    'SELECT "id" FROM "landmarks"',
    'START TRANSACTION',
    'INSERT INTO "refresh_tokens"("id") VALUES ($1)',
    'UPDATE "refresh_tokens" SET "revoked_at" = now()',
  ])('does nothing for %s', async (sql) => {
    await subscriber.beforeQuery(eventFor(sql));

    expect(connection.query).not.toHaveBeenCalled();
  });
});
