# Sources module

## Purpose

The Sources module owns the shared provenance records used to identify where
village facts came from. Other modules use `SourceService` rather than
accessing the Sources repository directly. It provides source validation
through `ensureExists` and response mapping through `findByIds`.

Population, History, Landmarks, and Cultural Traits require a source
reference. Village Names may have a source reference, but it is optional.
References preserve a consistent source identity and metadata instead of
duplicating those details in each record.

## Data model

The `sources` table and `source_type` enum are created by
`1793287000000-CreateSources`.

| Field                    | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `id`                     | UUID primary key                                   |
| `title`                  | Required `varchar(255)`                            |
| `type`                   | Required `source_type` enum                        |
| `author`                 | Nullable `varchar(255)`                            |
| `url`                    | Nullable text                                      |
| `year`                   | Nullable integer, when present from 1 through 2100 |
| `createdAt`, `updatedAt` | Inherited timestamps                               |

The allowed source types are `BOOK`, `WEBSITE`, `ARCHIVE`, `SURVEY`, `ORAL`,
and `OTHER`. The database check `chk_sources_year_range` limits a non-null
year to 1–2100. The migration defines no unique constraint on source fields.

Foreign keys to `sources` use `ON DELETE RESTRICT`. This includes the
required source relationships for Population, History, Landmarks, and
Cultural Traits, as well as a Village Name's optional `sourceId` when set.
Deleting a referenced source is therefore rejected by PostgreSQL and mapped
by the service to `409 Conflict`. The source is not deleted when the
operation conflicts.

## API

All endpoints use the `/api/v1` prefix. Source IDs are UUIDs. List responses
use `{ data, meta }`, where `meta` contains `page`, `limit`, `total`, and
`totalPages`.

| Method and route             | Behavior                                    |
| ---------------------------- | ------------------------------------------- |
| `GET /api/v1/sources`        | Paginated source list with optional filters |
| `GET /api/v1/sources/:id`    | Get a source by ID                          |
| `POST /api/v1/sources`       | Create a source; returns 201                |
| `PATCH /api/v1/sources/:id`  | Partially update a source; returns 200      |
| `DELETE /api/v1/sources/:id` | Delete an unreferenced source; returns 204  |

### Query parameters

`GET /api/v1/sources` accepts:

- `q`: optional string up to 100 characters. Searches title or author
  case-insensitively using substring matching; SQL `LIKE` metacharacters in
  the supplied text are treated literally.
- `type`: one of the `SourceType` values.
- `year`: integer from 1 through 2100.
- `page`: positive integer, default `1`.
- `limit`: integer from 1 through 100, default `20`.
- `sort`: `title`, `type`, `year`, or `createdAt`; default `title`.
- `order`: `asc` or `desc`; default `asc`.

Results sort by the selected field, with null values last, then by `id ASC`.

### Request fields

**Create** requires `title` (string, nonempty, maximum 255 characters) and
`type`. `author` is optional (string, maximum 255); `url` is optional and
must be a valid HTTP or HTTPS URL; `year` is optional (integer from 1 through
2100). Omitted optional fields are stored as null. The DTO uses
`IsNotEmpty` for title; it does not separately reject whitespace-only text.

**Update** accepts any subset of `title`, `type`, `author`, `url`, and `year`.
Title and type cannot be null. Optional author, URL, and year can be cleared
by sending `null`; omitted fields remain unchanged. URL and year constraints
are the same as for create. An empty patch is accepted and returns the
current source fields.

All DTOs are processed by the global validation pipe, which rejects unknown
properties. Invalid body fields or query parameters return `400` with
validation details.

`SourceResponseDto` contains `id`, `title`, `type`, `author`, `url`, `year`,
`createdAt`, and `updatedAt`.

### Status codes and errors

- `GET /api/v1/sources` returns `200`; invalid query parameters return `400`.
- `GET /api/v1/sources/:id` returns `200`, `400` for a malformed UUID, or
  `404` when the source does not exist.
- `POST /api/v1/sources` returns `201` or `400` for invalid fields.
- `PATCH /api/v1/sources/:id` returns `200`, `400` for an invalid UUID or
  body, or `404` when the source does not exist.
- `DELETE /api/v1/sources/:id` returns `204`, `400` for a malformed UUID,
  `404` when the source does not exist, or `409` when another record
  references it.

Other modules use `ensureExists` when a request body refers to a source that
is not itself the requested resource. A valid but unknown `sourceId` in
those operations is reported as `422 Unprocessable Entity`, rather than
`404`.

## Access limitations

Read endpoints have no role metadata and are public. Create, update, and
delete declare `@Roles` metadata, but the global `RolesGuard` currently
allows every request without checking the required roles. The global JWT
guard permits requests without an Authorization header and rejects malformed
or invalid bearer tokens with `401`. Consequently, source writes are
currently reachable anonymously; the declared roles are not an enforced
permission check.

## Testing

Run the Source unit tests with:

```bash
npm test -- --runInBand src/modules/source/source.service.spec.ts
```

Run the Source PostgreSQL E2E tests with:

```bash
NODE_ENV=test DB_NAME=qaryati_test DB_RUN_MIGRATIONS=true npm run test:e2e -- --runTestsByPath test/source.e2e-spec.ts
```

E2E startup can run migrations automatically. Use only the isolated
`qaryati_test` database for E2E tests and migrations; never use the
development or production database.
