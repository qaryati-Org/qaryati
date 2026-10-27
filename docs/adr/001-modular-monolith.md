# ADR-001: Modular monolith with NestJS, PostgreSQL and TypeORM

- Status: Accepted
- Date: 2026-10-27
- Deciders: Rashad, Lina, Ahmad, Yahya

## Context

Qaryati has several related but distinct domain areas (village identity,
population, heritage, geography, economy) plus cross-cutting concerns
(auth, audit, provenance, external geocoding). Four developers work in
parallel for about five weeks, and the system must be easy to run with
Docker, test, and load-test.

## Decision

Build a **modular monolith** in **NestJS (TypeScript)**:

- One deployable application, one PostgreSQL database.
- One Nest module per feature (`src/modules/<feature>/`), each with its own
  controller → service → repository layers, DTOs and entities.
- Modules talk to each other only through exported services, never by
  reaching into another module's repository or tables.
- Shared building blocks (error format, pagination, logging, base entity)
  live in `src/common/`.
- TypeORM for entities and migrations; raw SQL (`dataSource.query`) where a
  query is clearer or faster in SQL (e.g. search, nearby villages).

## Alternatives considered

- **Microservices:** strong isolation, but it adds network calls,
  distributed transactions and deployment overhead with no benefit at this
  scale.
- **Classic layered monolith (controllers/, services/, repositories/ at the
  top level):** simple, but every feature touches every folder, so four
  developers would constantly edit the same directories.
- **Prisma instead of TypeORM:** good DX, but TypeORM's entity subscribers
  fit the audit-log requirement and its raw-query support is simpler to use
  alongside the ORM.

## Consequences

- Each team member owns a module folder, which keeps merge conflicts rare.
- Clear module boundaries keep a later extraction into services possible.
- All modules share one database and transaction scope, so multi-step
  operations stay consistent without distributed transactions.
- We must keep discipline about boundaries ourselves. Code review checks
  that no module imports another module's entities or repositories
  directly.
