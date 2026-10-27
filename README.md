# Qaryati – Palestinian Villages Knowledge Platform

Backend API that stores structured, sourced information about Palestinian
villages: identity and names, administrative affiliation, geography,
population history, history and heritage, local economy and facilities.

Stack: **NestJS (TypeScript) · PostgreSQL 16 · TypeORM · Docker**.

## Quick start

```bash
cp .env.example .env          # then set DB_PASSWORD
docker compose up -d --build  # API on :3000, Postgres on :5433
```

- Health: <http://localhost:3000/api/v1/health>
- Swagger UI: <http://localhost:3000/api/docs>
- OpenAPI JSON (import into API-Dog): <http://localhost:3000/api/docs-json>

### Local development (API outside Docker)

```bash
npm ci
docker compose up -d db
npm run start:dev
```

### Tests

```bash
npm test            # unit tests
npm run test:e2e    # e2e tests (needs `docker compose up -d db`)
npm run lint:check
```

### Migrations

The schema changes only through migrations (`synchronize` is off).
They run automatically on startup (`DB_RUN_MIGRATIONS=true`).

```bash
npm run migration:generate src/database/migrations/AddPopulationRecords  # from entity changes
npm run migration:create src/database/migrations/AddSearchIndexes        # empty, hand-written
npm run migration:run
npm run migration:revert
```

## Project structure

```
src/
  main.ts, setup-app.ts     bootstrap: /api/v1 prefix, validation, error filter, Swagger
  config/                   typed config + startup validation of env vars
  database/                 TypeORM options, CLI data source, migrations/
  common/                   shared building blocks (errors, pagination, logging, base entity)
  health/                   GET /api/v1/health
  modules/<feature>/        one folder per feature module (controller, service, dto, entities)
```

## API conventions

- All endpoints are under `/api/v1/...`.
- List endpoints accept `page`, `limit` (max 100), `sort`, `order`, and return
  `{ data: [...], meta: { page, limit, total, totalPages } }`.
- Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "page", "messages": ["page must not be less than 1"] }],
    "path": "/api/v1/villages?page=0",
    "timestamp": "2026-10-27T12:08:16.885Z",
    "correlationId": "88c9b01e-…"
  }
}
```

- Send `x-correlation-id` to trace a request; it is echoed in the response,
  the logs, and error bodies.

## Team

| Member | Area |
|---|---|
| Rashad | Village core, search, project infrastructure |
| Lina | Auth, users, roles, audit log, security config |
| Ahmad | Sources/provenance, population, history, heritage |
| Yahya | Geography, external geocoding API, economy, facilities |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the Git workflow and
[docs/adr](docs/adr) for architecture decisions.
