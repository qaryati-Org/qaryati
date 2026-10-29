# Contributing

## Branches and pull requests

- `main` is protected: no direct pushes. Everything goes through a pull
  request with **1 approval and green CI**.
- Branch names: `feature/<module>-<short-desc>`, `fix/<module>-<desc>`,
  `docs/<topic>`, e.g. `feature/population-history-endpoint`.
- Keep PRs small (one feature, ideally < 400 changed lines) and fill in the
  PR template. Link the issue (`Closes #12`).
- Merge with **"Create a merge commit"** or **"Rebase and merge"**, not
  squash, so each person's commits stay visible.
- Update your branch from `main` at least once a day:

```bash
git fetch origin
git rebase origin/main
```

## Commits

Use focused commits with a type and module scope:

```
feat(population): reject records with a future reference year
fix(village): escape LIKE wildcards in search
test(auth): cover expired refresh token
docs(adr): add ADR-002 token strategy
```

## Who owns what

Work inside your own module folder: `src/modules/<module>/`. Shared files
have one owner; open a small separate PR (and ping the owner) to change them.

| Shared area | Owner |
|---|---|
| `package.json`, `docker-compose.yml`, `Dockerfile`, `.github/`, `src/common/`, `src/config/`, `src/main.ts`, `src/setup-app.ts` | Rashad |
| Security config (auth guards, roles, rate limiting, CORS) | Lina |
| `src/modules/source/` (provenance used by other modules) | Ahmad |
| Geocoding provider interface | Yahya |

`src/app.module.ts` has one import line per feature module; add only your
own line.

## Migrations

- Never edit a migration after it is merged to `main`; add a new one.
- Generated migrations get a timestamp in the file name, so two people
  never collide on a version number.
- Each migration touches only your module's tables.
- If you hand-write a migration, give constraints and indexes explicit
  names and use the same names in the entity (`@Unique('name', [...])`,
  `@Index('name')`, `foreignKeyConstraintName`). Otherwise TypeORM sees a
  difference and the next generated migration drops and recreates them.
- Check that entities and the database agree (expect "No changes"):

```bash
npm run typeorm -- migration:generate src/database/migrations/Check --dryrun
```

## Secrets

Never commit `.env` or real credentials. Add new variables to `.env.example`
(with a placeholder value) and to `src/config/env.validation.ts`.

## Before opening a PR

```bash
npm run lint:check
npm test
npm run test:e2e
```
