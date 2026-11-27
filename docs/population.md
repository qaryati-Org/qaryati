# Population module

## Purpose

The Population module stores sourced population observations for villages.
Each observation belongs to one village, references one `Source`, and records
a value for a reference year. Different claims for the same year are kept as
separate records with their own provenance and review status.

The module uses `VillageService` and `SourceService` for its references. Its
record API returns `sourceId`; the derived population-history API also
includes the matching source details.

## Data model

The `population_records` table is created by
`1794574252708-CreatePopulationRecords`. The shared
`verification_status` enum is created by
`1794574251708-CreateVerificationStatusType`.

| Field                    | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `id`                     | UUID primary key                                            |
| `villageId`              | Required village UUID                                       |
| `sourceId`               | Required source UUID                                        |
| `value`                  | Required non-negative integer; zero is valid                |
| `referenceYear`          | Required integer, database range 1–2100                     |
| `status`                 | `PENDING`, `VERIFIED`, or `REJECTED`; defaults to `PENDING` |
| `reviewedAt`             | Nullable server review timestamp                            |
| `reviewedById`           | Nullable UUID of the reviewer                               |
| `reviewNote`             | Nullable review note                                        |
| `createdAt`, `updatedAt` | Inherited timestamps                                        |

The database enforces:

- `chk_population_records_value_non_negative`: `value >= 0`.
- `chk_population_records_year_range`: `reference_year` is between 1 and 2100. The service additionally rejects a reference year later than the
  current calendar year.
- `uq_population_records_village_year_value_source`: the same value from the
  same source cannot be recorded twice for a village and year.
- `uq_population_records_verified_village_year`: a partial unique index
  allows at most one `VERIFIED` record per village and year.
- Required village and source foreign keys, plus the optional reviewer
  foreign key, use `ON DELETE RESTRICT`.
- `idx_population_records_source_id` indexes source references.

The exact-duplicate constraint permits different population values or
sources to coexist for the same year. The partial unique index limits a
village and year to one VERIFIED record; competing records may remain
PENDING or REJECTED. The database does not automatically identify which
claim is correct.

## API

All routes use the `/api/v1` prefix. Village and record path IDs are UUIDs.
List endpoints return `{ data, meta }`, where `meta` contains `page`,
`limit`, `total`, and `totalPages`.

### Population records

| Method and route                                                 | Behavior                                         |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/v1/villages/:villageId/population-records`             | Paginated records with optional filters          |
| `GET /api/v1/villages/:villageId/population-records/:id`         | Get a record by ID                               |
| `POST /api/v1/villages/:villageId/population-records`            | Create a record; returns 201                     |
| `PATCH /api/v1/villages/:villageId/population-records/:id`       | Update a PENDING record; returns 200             |
| `DELETE /api/v1/villages/:villageId/population-records/:id`      | Delete a PENDING or REJECTED record; returns 204 |
| `POST /api/v1/villages/:villageId/population-records/:id/verify` | Verify a record; returns 200                      |
| `POST /api/v1/villages/:villageId/population-records/:id/reject` | Reject a record; returns 200                      |

The list query accepts:

- `status`: `PENDING`, `VERIFIED`, or `REJECTED`. It defaults to `VERIFIED`,
  but callers can explicitly request either unverified status. This route is
  public, so the status filter currently makes pending and rejected records
  publicly retrievable.
- `year`: exact reference year from 1 through 2100.
- `sourceId`: source UUID.
- `page`: positive integer, default `1`.
- `limit`: integer from 1 through 100, default `20`.
- `sort`: `referenceYear`, `value`, or `createdAt`; default `referenceYear`.
- `order`: `asc` or `desc`; default `asc`.

Records are sorted by the selected field and then by `id ASC`. The default
order is `referenceYear ASC`, then `id ASC`.

The GET-by-ID route scopes the lookup to both village and record ID, but does
not filter by verification status. It currently returns `PENDING`,
`VERIFIED`, or `REJECTED` records when they belong to the requested village.
An unknown record or a record belonging to another village returns 404.

**Create** requires:

- `value`: integer from 0 through 2,147,483,647.
- `referenceYear`: integer from 1 through 2100 and not later than the
  current calendar year.
- `sourceId`: UUID for an existing source.

New records start as `PENDING` with null review metadata. **Update** accepts
any subset of `value`, `referenceYear`, and `sourceId`; omitted fields remain
unchanged. Explicit `null` values are invalid. Only PENDING records can be
updated. Status and review metadata are not client-editable.

`PopulationRecordResponseDto` returns `id`, `villageId`, `sourceId`, `value`,
`referenceYear`, `status`, `reviewedAt`, `reviewedById`, `reviewNote`,
`createdAt`, and `updatedAt`. It does not embed a source object or expose
entity relationships.

### Population history

`GET /api/v1/villages/:villageId/population-history` returns the village's
verified population observations in chronological order. It accepts
`page` (default `1`) and `limit` (default `20`, maximum `100`); `sort` may
only be `referenceYear` and `order` may only be `asc`. The service always
orders by `referenceYear ASC`, then `id ASC`. Other filters are not accepted.

Only `VERIFIED` records contribute to the history. For each observation, the
service calculates `previousReferenceYear`, `previousValue`, and
`populationChange` from the preceding verified observation. The first
observation has null previous-value and change fields. These are comparisons
between recorded observations, not estimates for missing years. Years with
no verified observation are omitted, and the previous observation is
calculated before pagination.

`PopulationHistoryResponseDto` includes `id`, `villageId`, `referenceYear`,
`value`, `previousReferenceYear`, `previousValue`, `populationChange`, and a
nested `source` containing `id`, `title`, `type`, `author`, `url`, and `year`.
If a referenced source is unavailable, the service raises an internal server
error rather than returning incomplete provenance.

### Errors

Relevant HTTP responses include:

- `400` for malformed UUIDs, invalid query or body fields, and a create or
  update `referenceYear` later than the current year. The list `year` filter
  may still specify any database-valid year through 2100.
- `404` for an unknown village or record, including a record requested under
  a different village path.
- `409` for duplicate figures, a second VERIFIED observation for the same
  village and year, editing a non-PENDING record, or deleting a VERIFIED
  record.
- `422` when create or update supplies a valid source UUID that does not
  exist. A valid but unknown `sourceId` used as a list filter simply matches
  no records.
- `401` for a missing or invalid access token on protected write and review
  routes; `403` when an authenticated user's role is not allowed for that
  route.

## Verification workflow

New records start as `PENDING`. The shared verification policy allows:

- `PENDING` → `VERIFIED`
- `PENDING` → `REJECTED`
- `VERIFIED` → `REJECTED`
- `REJECTED` is terminal

The service records `status`, server-generated `reviewedAt`, trusted
`reviewedById`, and `reviewNote` together. Review updates compare the record's
ID, village ID, and previously read status in a conditional database update.
A concurrent status change or a conflicting verified record returns `409`.
Only PENDING records can be edited; VERIFIED records cannot be deleted, while
PENDING and REJECTED records can be deleted.

The HTTP verify and reject endpoints are enabled for callers with the
`VERIFIER` or `ADMIN` role. Verification accepts an optional `reviewNote`
(maximum 1,000 characters); rejection requires a non-whitespace `reviewNote`
(maximum 1,000 characters). The controller derives the reviewer ID from the
authenticated user and passes it to the service. Reviewer identity fields
such as `reviewerId` and `reviewedById` are not accepted from the request
body.

## Authentication and authorization

Population list, GET-by-ID, and population-history routes are public. A
missing token is allowed for these reads; a malformed or invalid bearer token
returns `401`.

- Create and update require `EDITOR` or `ADMIN`.
- Delete requires `ADMIN`.
- Verify and reject require `VERIFIER` or `ADMIN`.

Protected routes return `401` when the access token is missing or invalid, and
`403` when an authenticated user does not have a role listed for that route.
Roles are checked against each endpoint's `@Roles` declaration.

## Testing

Run the Population unit tests with:

```bash
npm test -- --runInBand src/modules/population/population.service.spec.ts src/modules/population/dto/population-review.dto.spec.ts
```

Run the Population PostgreSQL E2E tests with:

```bash
NODE_ENV=test DB_NAME=qaryati_test DB_RUN_MIGRATIONS=true npm run test:e2e -- --runTestsByPath test/population-records.e2e-spec.ts test/population-history.e2e-spec.ts test/population-review.e2e-spec.ts test/population-data-model.e2e-spec.ts
```

E2E startup can run migrations automatically. Use only the isolated
`qaryati_test` database for E2E tests and migrations; never use the
development or production database.
