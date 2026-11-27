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
| `GET /villages/:villageId/landmarks` | Paginated list; VERIFIED is public, unverified statuses are role-restricted |
| `GET /villages/:villageId/landmarks/:id` | Public lookup of a VERIFIED landmark; returns 200 |
| `POST /villages/:villageId/landmarks` | Create a landmark; returns 201 |
| `PATCH /villages/:villageId/landmarks/:id` | Update a PENDING landmark; returns 200 |
| `DELETE /villages/:villageId/landmarks/:id` | Delete a PENDING or REJECTED landmark; returns 204 |
| `POST /villages/:villageId/landmarks/:id/verify` | Verify a landmark; returns 200 |
| `POST /villages/:villageId/landmarks/:id/reject` | Reject a landmark; returns 200 |

The GET-by-ID route returns only VERIFIED landmarks. Invalid village or
landmark UUIDs return 400; an unknown village, missing record, record from
another village, or PENDING or REJECTED record returns 404.

Create requires `name` (non-whitespace, up to 255 characters), `type`,
`description` (non-whitespace, up to 10,000 characters), and UUID `sourceId`.
The village ID comes from the route. New records start `PENDING` with empty
review metadata.

Update accepts any subset of `name`, `type`, `description`, and `sourceId`.
Explicit `null` values and status or review metadata are not accepted.
The verify DTO accepts an optional `reviewNote`; the reject DTO requires a
non-whitespace `reviewNote`. Both are limited to 1,000 characters.

Listing accepts an optional `status` (`VERIFIED`, `PENDING`, or `REJECTED`),
optional `type`, `page` (default 1), and `limit` (default 20, maximum 100).
The status defaults to `VERIFIED`; VERIFIED results are public, including
explicit `status=VERIFIED`. PENDING and REJECTED results require an
authenticated `EDITOR`, `VERIFIER`, or `ADMIN`; anonymous requests return 401
and VIEWER requests return 403. The role is read from the JWT, not from
client-supplied role headers or query values. A malformed or invalid supplied
bearer token returns 401, even for VERIFIED reads. Sorting is fixed to
`name ASC`, then `id ASC`; `sort` only accepts `name` and `order` only accepts
`asc`. Results use `{ data, meta }`, where `meta` contains `page`, `limit`,
`total`, and `totalPages`.

Each response includes `id`, `villageId`, `sourceId`, `name`, `type`,
`description`, `status`, `reviewedAt`, `reviewedById`, `reviewNote`,
`createdAt`, and `updatedAt`. The nested `source` summary has `id`, `title`,
`type`, `author`, `url`, and `year`.

Important errors are 400 for invalid IDs, fields, or query parameters; 404
for an unknown village or landmark; 409 for a disallowed state change or
concurrent update; and 422 for an unknown source. Unauthenticated requests for
PENDING/REJECTED lists return 401, and VIEWER requests for those lists return
403.

## Review and access

The shared verification policy allows `PENDING → VERIFIED`,
`PENDING → REJECTED`, and `VERIFIED → REJECTED`. `REJECTED` is terminal.
Only PENDING records can be edited. VERIFIED records cannot be edited or
deleted; PENDING and REJECTED records can be deleted.

The service implements verify and reject with a conditional status update and
stores `status`, server-set `reviewedAt`, trusted `reviewedById`, and
`reviewNote` together. The verify and reject routes require `VERIFIER` or
`ADMIN` and return `200` on success. The controller derives the reviewer ID
from the authenticated user; client-supplied `reviewerId` or `reviewedById`
values are not accepted.

Create and update require `EDITOR` or `ADMIN`; delete requires `ADMIN`.
Protected write and review routes return `401` when the access token is
missing or invalid, and `403` when an authenticated user does not have an
allowed role. VERIFIED list results and VERIFIED GET-by-ID results are public;
the list requires a token for PENDING or REJECTED results. GET-by-ID remains
VERIFIED-only and returns 404 for PENDING or REJECTED records. A malformed or
invalid bearer token is rejected with 401, including on public VERIFIED reads.

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
