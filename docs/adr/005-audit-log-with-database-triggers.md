# ADR-005: Audit Log with Database Triggers

- **Status:** Accepted
- **Date:** 2026-11-27
- **Deciders:** Lina, Rashad, Ahmad, Yahya

## Context

The project must keep an audit log: who changed which record, what the
values were before and after, and when. It must cover village data
(villages, names, sources, population, history, landmarks, cultural traits)
and users, and other modules should not have to change their code for it.

ADR-001 expected TypeORM entity subscribers to do this. Before building it we
checked how the modules actually write:

- `save()` and `remove()`: subscribers receive the full row, and for updates
  the row before the change.
- `update(where, values)` and `delete(where)` (heritage and history edits,
  reviews and deletes): subscribers receive only the new values, **without
  the row id and without the old values**.
- Raw SQL (`dataSource.query`, population verify/reject): **no subscriber
  event at all**.

A subscriber-only audit log would have missed most edits, reviews and
deletes.

## Decision

1. **A PostgreSQL trigger records every change.** `audit_log_row()` runs
   `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW` on every audited
   table and inserts into `audit_logs`: table, record id, action, old row,
   new row, changed columns, time. It sees every write, whatever the
   application used to make it. Updates that only touch `updated_at` are
   skipped. `password_hash` is removed from the stored rows; its name still
   appears in `changed_columns`.
2. **The application tells PostgreSQL who is writing.** A global
   interceptor puts the authenticated user and the correlation id into an
   `AsyncLocalStorage` context for the request. A TypeORM `beforeQuery`
   subscriber runs, before every `INSERT` / `UPDATE` / `DELETE`, on the same
   connection, `set_config('qaryati.actor_id', …)` and
   `set_config('qaryati.correlation_id', …)`. The trigger reads both.
   `beforeQuery` also fires for raw `dataSource.query()` calls.
3. **The settings are overwritten before every write**, with an empty value
   when there is no user, so a pooled connection never carries an earlier
   caller into another request's write. Writes to `refresh_tokens` and
   `audit_logs` (no trigger) are skipped.
4. **Reading:** `GET /api/v1/audit-logs`, `ADMIN` only, filtered by table,
   record, user, action and time, newest first.

## Alternatives considered

1. **TypeORM entity subscribers only** (`afterInsert` / `afterUpdate` /
   `afterRemove`). No database code, but misses `update(where)`,
   `delete(where)` and raw SQL, as shown above.
2. **Explicit `auditService.record(...)` calls in every service.** Complete
   and visible, but every module must remember to call it in every write
   path, and a forgotten call silently loses history.
3. **An HTTP interceptor logging every write request.** Knows the user, but
   not the stored values before and after, and not which rows a request
   changed.
4. **Triggers with the user passed per transaction (`SET LOCAL`).** Safest
   way to pass the user, but most writes do not run in a transaction, so
   every write request would need to be wrapped in one.
5. **Triggers + `AsyncLocalStorage` + `set_config` before each write
   (selected).** Complete capture in the database, the user from the
   request, and no changes in other modules.

## Consequences and limitations

- Every change of an audited table is recorded, including direct SQL in
  migrations, seeds and tests (with `actor_id` NULL when there is no request).
- A new table with user data needs one line in a new migration (a trigger);
  forgetting it means its changes are not audited.
- **Cost:** one extra small query per write and one extra row insert in the
  database. Measured with the k6 write test: about 15% less write throughput
  and 16% higher p95 ([performance/audit.md](../performance/audit.md)).
- `actor_id` has no foreign key, so history outlives users and a missing user
  never blocks a write.
- The audit table only grows. A retention or archiving policy (e.g. monthly
  partitions) is future work.
- Anyone with direct database access could still change data or audit rows;
  the audit log protects against mistakes and misuse through the API, not
  against a database administrator.

See [docs/audit.md](../audit.md) for how to read the log, the
[trigger migration](../../src/database/migrations/1795812300000-AddAuditTriggers.ts)
and the [audit module](../../src/modules/audit).
