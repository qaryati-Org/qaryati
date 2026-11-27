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
| `POST /villages/:villageId/cultural-traits/:id/verify` | Currently returns 401 |
| `POST /villages/:villageId/cultural-traits/:id/reject` | Currently returns 401 |

The GET-by-ID route returns only VERIFIED traits. Invalid village or trait
UUIDs return 400; an unknown village, missing record, record from another
village, or PENDING or REJECTED trait returns 404.

Create requires `name` (non-whitespace, up to 255 characters), `type`, a
non-whitespace `description` (up to 10,000 characters), and UUID `sourceId`.
The village ID comes from the route. New records start as `PENDING` with null
review metadata.

Update accepts any subset of `name`, `type`, `description`, and `sourceId`.
Explicit `null` values and status or review metadata are not accepted. The
review DTOs define an optional `reviewNote` for verification and a required
non-whitespace `reviewNote` for rejection, each limited to 1,000 characters;
the HTTP review handlers return 401 before using these bodies.

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

JWT authentication is available through the global guard. Requests without a
token are allowed as anonymous, and malformed or invalid bearer tokens return
401. Create, update, and delete have `@Roles` metadata, but the global
`RolesGuard` remains permissive and does not enforce those permissions, so
these routes are reachable without authentication.

The review controller does not yet pass the authenticated user as the
trusted reviewer. The verify and reject HTTP routes deliberately remain
blocked with 401 until role enforcement and reviewer identity are connected.

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
