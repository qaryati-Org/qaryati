# Performance: cost of the audit log

Script: [`k6/authenticated-write.js`](../../k6/authenticated-write.js), the
same scenario and data as [write.md](write.md) (50 editors writing, 2 logins
per second, 50,116 villages).
Change measured: the audit log ([ADR-005](../adr/005-audit-log-with-database-triggers.md)),
i.e. the `audit_log_row()` triggers plus the `set_config` query before each
write.

## Result

Median of three runs each, run alternately:

| | Without audit | With audit | Change |
|---|---:|---:|---:|
| Requests per second | 298.0 | 253.1 | −15% |
| Complete write flows per second | 98.6 | 83.7 | −15% |
| Average response time | 79.8 ms | 106.4 ms | +33% |
| Median (p50) | 69.0 ms | 95.0 ms | +38% |
| p95 | 188.0 ms | 219.0 ms | +16% |
| p99 | 298.8 ms | 401.3 ms | +34% |
| Failed requests | 0% | 0% | |
| API CPU per 100 requests/s | 0.55 cores | 0.68 cores | +24% |

Per step (avg):

| Step | Without audit | With audit |
|---|---:|---:|
| `POST /sources` (1 audited insert) | 48.7 ms | 57.9 ms |
| `POST /villages/:id/landmarks` (1 audited insert) | 105.4 ms | 141.9 ms |
| `PATCH /villages/:id/landmarks/:id` (1 audited update) | 83.8 ms | 117.7 ms |

All runs (requests per second):

| Round | Without audit | With audit |
|---|---:|---:|
| 1 | 314.5 | 284.8 |
| 2 | 287.1 | 253.1 |
| 3 | 298.0 | 243.5 |

"With audit" was slower in every round. The machine was noisier than for the
[write test](write.md) (the "without" runs spread 287–315 instead of
306–318), so the exact percentage is less certain than the direction.

## Where the cost comes from

1. **One extra query per write.** Before every `INSERT` / `UPDATE` /
   `DELETE`, the API sends `set_config(...)` on the same connection so the
   trigger knows the caller. That is one more round trip handled by the API's
   single JavaScript thread, which was already the bottleneck
   ([write.md](write.md)); CPU per request rose by about a quarter.
2. **One extra row insert per write** inside PostgreSQL (`to_jsonb` of the
   old and new row, three indexes on `audit_logs`).

The "with audit" runs got slower each round while `audit_logs` grew from
about 40,000 to 110,000 rows during the test; the "without" runs did not
show that trend. This was not investigated further. Index growth on
`audit_logs` is one possible reason.

## Setup

As in [write.md](write.md). "Without audit": the API built without
`AuditModule` and the trigger migration reverted. "With audit": the full API
and all triggers. Each run started with the rows of the previous run removed
(`k6/cleanup-authenticated-write.sql`).

## Possible improvements (not done)

- Skip `set_config` when the connection already carries the same caller (it
  would still be needed whenever the correlation id changes, i.e. every
  request, unless the correlation id is dropped from the audit row).
- Partition `audit_logs` by month and archive old partitions, so inserts and
  index maintenance stay cheap as the log grows.
- Run several API processes, which removes the single-thread limit for both
  the writes and the audit work.

The cost was accepted: an audit log that misses edits, reviews or deletes
would not meet the requirement, and the API still handles about 250 write
requests per second with 0% errors.
