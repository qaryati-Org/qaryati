# History module

## Purpose

The History module stores a village-level historical overview and historical
timeline events. Records have one of two types:

- `OVERVIEW` — the village's historical overview. At most one may exist per
  village.
- `EVENT` — a dated or undated event. A village may have multiple events.

Each record cites a `Source`. History uses the exported `SourceService` API to
validate source IDs and include source provenance in responses; it does not
access the Sources repository directly.

## Data model

The `history_records` table is owned by the History module and is created by
`1795623515961-CreateHistoryRecords`.

| Field                    | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `id`                     | UUID primary key                                      |
| `villageId`              | Required village UUID                                 |
| `sourceId`               | Required source UUID                                  |
| `type`                   | `OVERVIEW` or `EVENT`                                 |
| `title`                  | Required string, maximum 255 characters               |
| `description`            | Required text                                         |
| `startYear`              | Optional integer year                                 |
| `endYear`                | Optional integer year                                 |
| `status`                 | Verification status; new records default to `PENDING` |
| `reviewedAt`             | Nullable server review timestamp                      |
| `reviewedById`           | Nullable UUID of the trusted reviewer                 |
| `reviewNote`             | Nullable review note                                  |
| `createdAt`, `updatedAt` | Inherited timestamps                                  |

Village and source references are required and use `ON DELETE RESTRICT`.
Reviewer references are nullable and also use `ON DELETE RESTRICT`, preserving
the identity attached to review metadata.

Years may be unknown (`NULL`). Negative integers represent BCE; year zero is
forbidden. There is no application-level lower-year limit, and years cannot
exceed 2100. An `endYear` requires a `startYear`, and when both are present,
`startYear` must be less than or equal to `endYear`. The service validates
these rules, including the effective pair on partial updates, and PostgreSQL
enforces them as well.

The migration names its checks and indexes explicitly:

- `chk_history_records_end_year_requires_start_year`
- `chk_history_records_start_year_not_zero`
- `chk_history_records_end_year_not_zero`
- `chk_history_records_start_year_max`
- `chk_history_records_end_year_max`
- `chk_history_records_year_order`
- `idx_history_records_village_id`
- `idx_history_records_source_id`
- `uq_history_records_village_overview` — partial unique index on
  `village_id` where `type = 'OVERVIEW'`. It applies regardless of verification
  status. It does not restrict `EVENT` records.

## API

All routes use the `/api/v1` prefix. Village and record path IDs are UUIDs.

### Public listing

`GET /api/v1/villages/:villageId/history`

This route is public and returns **VERIFIED records only**. It supports the
optional `type` filter (`OVERVIEW` or `EVENT`) and pagination parameters
`page` (default `1`) and `limit` (default `20`, maximum `100`). Sorting is
fixed: `startYear ASC NULLS FIRST`, then `id ASC`; `sort` may only be
`startYear` and `order` may only be `asc`. A client-supplied `status` filter
is rejected, so pending and rejected records cannot be requested.

Each item contains the record fields listed above and a nested `source` object
with `id`, `title`, `type`, `author`, `url`, and publication `year`. Results
use the standard pagination envelope:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

### Create, update, and delete

The current CRUD routes are:

- `POST /api/v1/villages/:villageId/history` — creates a `PENDING` record and
  returns `201`. Pending records are hidden from the public listing until
  verified.
- `PATCH /api/v1/villages/:villageId/history/:id` — updates a `PENDING` record
  and returns `200`. Verified records cannot be edited.
- `DELETE /api/v1/villages/:villageId/history/:id` — deletes a `PENDING` or
  `REJECTED` record and returns `204`. Verified records cannot be deleted.

These routes have `@Roles` metadata, but the project's current global
`RolesGuard` is permissive and does not enforce roles. The CRUD routes are
therefore reachable without authentication, including by anonymous clients.
This temporary behavior matches Population's current API behavior; it is **not
secure authorization**. Trusted authentication and actual role enforcement
are still required as part of Lina's authentication integration. Do not rely
on the `@Roles` annotations as an access control boundary.

Request fields:

- **Create:** required `type`, non-whitespace `title` (maximum 255),
  non-whitespace `description` (maximum 10,000), and UUID `sourceId`;
  optional `startYear` and `endYear`.
- **Update:** any subset of `type`, `title`, `description`, `sourceId`,
  `startYear`, and `endYear`. Year fields may be set to `null` to clear them,
  provided the effective year pair remains valid. Status and review metadata
  are not client-editable.
- **Verify:** optional `reviewNote` (maximum 1,000 characters); explicit
  `null` is invalid.
- **Reject:** required nonempty, non-whitespace `reviewNote` (maximum 1,000
  characters).

The create and update response shape includes explicitly mapped record fields
and the nested source provenance object described above.

Important errors include `400` for invalid UUIDs, request fields, query
parameters, or year ranges; `404` for an unknown village or record; `409` for
duplicate overviews, forbidden state changes, or a concurrent write conflict;
and `422` for an unknown source. CRUD `POST`, `PATCH`, and `DELETE` do not
currently return `401` or `403` for missing roles because the global guard is
permissive.

### Verify and reject

- `POST /api/v1/villages/:villageId/history/:id/verify`
- `POST /api/v1/villages/:villageId/history/:id/reject`

Both HTTP review routes intentionally return `401` until trusted authentication
and role enforcement are integrated. They have a History-specific guard, and
the controller does not fabricate a reviewer identity or invoke the review
service methods. The service implements and tests the complete verification
workflow independently; see [Verification workflow](#verification-workflow).
When the HTTP routes are safely enabled, verify will accept an optional
`reviewNote` (maximum 1,000 characters; explicit `null` is invalid), and reject
will require a nonempty, non-whitespace `reviewNote` (maximum 1,000
characters).

## Verification workflow

The shared `assertTransition` policy enforces:

- `PENDING` → `VERIFIED`
- `PENDING` → `REJECTED`
- `VERIFIED` → `REJECTED`
- `REJECTED` is terminal

The service records `status`, server-generated `reviewedAt`, trusted
`reviewedById`, and `reviewNote` together. Review updates compare the record's
ID, village ID, and previously read status in one conditional database update;
if another request changes the status first, the operation returns `409`.
Historical content fields are not changed by review operations.

## Testing

Commit 4 recorded these results:

- Unit tests: **204 passed** overall, including **53 History unit tests**.
- History PostgreSQL E2E tests: **23 passed**.
- Full PostgreSQL E2E suite: **206 passed across 13 suites**.

Reproduce the local checks with:

```bash
npm run lint:check
npm run build
npx tsc --noEmit
npm test
```

Run the History E2E tests or the complete E2E suite with:

```bash
NODE_ENV=test DB_NAME=qaryati_test DB_RUN_MIGRATIONS=true npm run test:e2e -- --runTestsByPath test/history.e2e-spec.ts test/history-data-model.e2e-spec.ts

NODE_ENV=test DB_NAME=qaryati_test DB_RUN_MIGRATIONS=true npm run test:e2e
```

E2E application startup can run migrations automatically. Use a dedicated,
isolated test database such as `qaryati_test`; never run E2E tests or automatic
migrations against the development or production database.
