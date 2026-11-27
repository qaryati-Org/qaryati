# Cultural Traits

Cultural Traits record traditions and cultural practices associated with a
village, such as crafts, food, and farming practices. Each record belongs to a
Village and references a required Source. Responses include a summary of that
source for provenance.

The supported `CulturalTraitType` values are `CRAFT`, `FOOD`, and
`FARMING_PRACTICE`.

## API

All routes use the `/api/v1` prefix. Village and trait IDs are UUIDs.

| Method and route | Behavior |
| --- | --- |
| `GET /villages/:villageId/cultural-traits` | Public, paginated list of VERIFIED traits |
| `GET /villages/:villageId/cultural-traits/:id` | Public lookup of a VERIFIED trait; returns 200 |
| `POST /villages/:villageId/cultural-traits` | Create a trait; returns 201 |
| `PATCH /villages/:villageId/cultural-traits/:id` | Update a PENDING trait; returns 200 |
| `DELETE /villages/:villageId/cultural-traits/:id` | Delete a PENDING or REJECTED trait; returns 204 |
| `POST /villages/:villageId/cultural-traits/:id/verify` | Verify a trait; returns 200 |
| `POST /villages/:villageId/cultural-traits/:id/reject` | Reject a trait; returns 200 |

The GET-by-ID route returns only VERIFIED traits. Invalid village or trait
UUIDs return 400; an unknown village, missing record, record from another
village, or PENDING or REJECTED trait returns 404.

Create requires `name` (non-whitespace, up to 255 characters), `type`, a
non-whitespace `description` (up to 10,000 characters), and UUID `sourceId`.
The village ID comes from the route. New records start as `PENDING` with null
review metadata.

Update accepts any subset of `name`, `type`, `description`, and `sourceId`.
Explicit `null` values and status or review metadata are not accepted. The
verify DTO accepts an optional `reviewNote`; the reject DTO requires a
non-whitespace `reviewNote`. Both are limited to 1,000 characters.

Listing accepts an optional `type`, plus `page` (default 1) and `limit`
(default 20, maximum 100). Results are ordered by `name ASC`, then `id ASC`;
`sort` only accepts `name` and `order` only accepts `asc`. There is no status
filter, so pending and rejected traits cannot be requested from the public
list. The response uses `{ data, meta }`, with `page`, `limit`, `total`, and
`totalPages` in `meta`.

Each trait response includes `id`, `villageId`, `sourceId`, `type`, `name`,
`description`, `status`, `reviewedAt`, `reviewedById`, `reviewNote`,
`createdAt`, and `updatedAt`. Its nested `source` summary includes `id`,
`title`, `type`, `author`, `url`, and `year`.

Invalid IDs, fields, or query parameters return 400; unknown villages or
traits return 404; disallowed state changes and concurrent write conflicts
return 409; unknown sources return 422.

## Verification and access

The shared verification policy allows:

- `PENDING` → `VERIFIED`
- `PENDING` → `REJECTED`
- `VERIFIED` → `REJECTED`

`REJECTED` is terminal. Only PENDING traits can be edited. VERIFIED traits
cannot be edited or deleted; PENDING and REJECTED traits can be deleted.
Review updates store the new status, server-set `reviewedAt`, trusted
`reviewedById`, and `reviewNote` together.

Create and update require `EDITOR` or `ADMIN`; delete requires `ADMIN`.
Verify and reject require `VERIFIER` or `ADMIN` and return `200` on success.
Protected write and review routes return `401` when the access token is
missing or invalid, and `403` when an authenticated user does not have an
allowed role. Public GET routes do not require a token; a malformed or invalid
bearer token is still rejected with `401`.

The review controller derives the reviewer ID from the authenticated user.
Client-supplied `reviewerId` or `reviewedById` values are not accepted.

## Tests

Run the focused unit tests with:

```bash
npm test -- --runInBand src/modules/heritage/cultural-trait.service.spec.ts src/modules/heritage/cultural-trait.controller.spec.ts
```

Run the Cultural Trait PostgreSQL E2E tests with:

```bash
NODE_ENV=test DB_NAME=qaryati_test DB_RUN_MIGRATIONS=true npm run test:e2e -- --runTestsByPath test/cultural-trait.e2e-spec.ts test/cultural-trait-data-model.e2e-spec.ts
```

E2E startup runs migrations when `DB_RUN_MIGRATIONS=true`. Run E2E tests
only against `qaryati_test`, not the development or production database.
Confirm the selected database before running migrations.
