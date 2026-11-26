# Landmarks

Landmark records describe individual places associated with a village. Each
record belongs to one village and cites a required source. The service uses
`VillageService` and `SourceService` for those references and includes a source
summary in responses.

The `LandmarkType` values are `SPRING`, `RELIGIOUS_SITE`,
`ARCHAEOLOGICAL_SITE`, `OLD_BUILDING`, and `VIEWPOINT`, matching the course
examples.

## API

All routes are under `/api/v1`; village and landmark IDs are UUIDs.

| Method and route | Behavior |
| --- | --- |
| `GET /villages/:villageId/landmarks` | Public, paginated list of VERIFIED landmarks |
| `POST /villages/:villageId/landmarks` | Create a landmark; returns 201 |
| `PATCH /villages/:villageId/landmarks/:id` | Update a PENDING landmark; returns 200 |
| `DELETE /villages/:villageId/landmarks/:id` | Delete a PENDING or REJECTED landmark; returns 204 |
| `POST /villages/:villageId/landmarks/:id/verify` | Currently returns 401 |
| `POST /villages/:villageId/landmarks/:id/reject` | Currently returns 401 |

Create requires `name` (non-whitespace, up to 255 characters), `type`,
`description` (non-whitespace, up to 10,000 characters), and UUID `sourceId`.
The village ID comes from the route. New records start `PENDING` with empty
review metadata.

Update accepts any subset of `name`, `type`, `description`, and `sourceId`.
Explicit `null` values and status or review metadata are not accepted.
The review DTOs define an optional `reviewNote` for verification and a required,
non-whitespace `reviewNote` for rejection (both are limited to 1,000
characters); the HTTP handlers currently return 401 before using these bodies.

Listing accepts an optional `type`, plus `page` (default 1) and `limit`
(default 20, maximum 100). Sorting is fixed to `name ASC`, then `id ASC`;
`sort` only accepts `name` and `order` only accepts `asc`. A status filter is
not accepted, so pending and rejected records cannot be requested from the
public list. Results use `{ data, meta }`, where `meta` contains `page`,
`limit`, `total`, and `totalPages`.

Each response includes `id`, `villageId`, `sourceId`, `name`, `type`,
`description`, `status`, `reviewedAt`, `reviewedById`, `reviewNote`,
`createdAt`, and `updatedAt`. The nested `source` summary has `id`, `title`,
`type`, `author`, `url`, and `year`.

Important errors are 400 for invalid IDs, fields, or query parameters; 404
for an unknown village or landmark; 409 for a disallowed state change or
concurrent update; and 422 for an unknown source.

## Review and access

The shared verification policy allows `PENDING → VERIFIED`,
`PENDING → REJECTED`, and `VERIFIED → REJECTED`. `REJECTED` is terminal.
Only PENDING records can be edited. VERIFIED records cannot be edited or
deleted; PENDING and REJECTED records can be deleted.

The service implements verify and reject with a conditional status update and
stores `status`, server-set `reviewedAt`, trusted `reviewedById`, and
`reviewNote` together. The HTTP review routes remain guarded and return 401
until trusted authentication is implemented.

Create, update, and delete currently have `@Roles` metadata, but the global
`RolesGuard` is permissive and does not enforce it. Those HTTP routes are
reachable without authentication. This is a current authorization limitation,
not a secure permission check.

## Tests

Run the focused unit tests with:

```bash
npm test -- --runInBand src/modules/heritage/landmark.service.spec.ts src/modules/heritage/landmark.controller.spec.ts
```

Run the Landmark PostgreSQL E2E tests with:

```bash
NODE_ENV=test DB_NAME=qaryati_test DB_RUN_MIGRATIONS=true npm run test:e2e -- --runTestsByPath test/landmark.e2e-spec.ts test/landmark-data-model.e2e-spec.ts
```

E2E startup runs migrations when `DB_RUN_MIGRATIONS=true`. Run E2E tests
only against `qaryati_test`, not the development or production database.
Confirm the selected database before running migrations.
