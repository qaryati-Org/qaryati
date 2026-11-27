# Performance: authenticated writes (k6 write scenario)

Endpoints: `POST /api/v1/sources`, `POST /api/v1/villages/:id/landmarks`,
`PATCH /api/v1/villages/:id/landmarks/:id`, `POST /api/v1/auth/login`
Script: [`k6/authenticated-write.js`](../../k6/authenticated-write.js)
Optimization: `VillageService.ensureExists()` replaces full village loads
used only as existence checks

## Result

Median of three runs each, before and after, run alternately on the same data:

| | Before | After | Change |
|---|---:|---:|---:|
| Requests per second | 286.0 | 311.0 | +8.7% |
| Complete write flows per second | 94.6 | 103.0 | +8.9% |
| Average response time | 85.6 ms | 73.5 ms | −14% |
| Median (p50) | 76.3 ms | 65.5 ms | −14% |
| p95 | 170.3 ms | 146.9 ms | −14% |
| p99 | 208.3 ms | 179.7 ms | −14% |
| Failed requests | 0% | 0% | |
| API CPU per 100 requests/s | 0.55 cores | 0.48 cores | −13% |

Per step:

| Step | Before avg / p95 | After avg / p95 |
|---|---:|---:|
| `POST /sources` (control: no village check) | 43.6 / 73.9 ms | 41.8 / 75.0 ms |
| `POST /villages/:id/landmarks` | 123.4 / 191.8 ms | 101.8 / 163.3 ms |
| `PATCH /villages/:id/landmarks/:id` | 88.2 / 159.2 ms | 75.5 / 133.8 ms |
| `POST /auth/login` (argon2id) | 140.9 / 185.0 ms | 139.1 / 168.7 ms |

Every "after" run was better than every "before" run (requests per second:
before 283.6, 286.0, 291.9; after 306.7, 311.0, 317.6). An earlier
exploratory "before" run reached 293.2, still below every "after" run.
Creating a source does not check a village and stayed the same, which shows
the gain comes from the change and not from run-to-run noise.

## Setup

- **Data:** `npm run seed` plus `npm run seed:perf`: 50,116 villages and
  50,014 alternative names, the same data set as the
  [search test](search.md).
- **Load, two scenarios at the same time:**
  - `writes`: 50 virtual users (15 s ramp-up, 60 s steady, 5 s ramp-down).
    Each iteration creates a source, creates a landmark citing it in a random
    village (from 500 villages), then edits the landmark's description, all
    with the bearer token. 0.1 to 0.3 s pause between iterations.
  - `logins`: 2 logins per second for 80 s.
- **Authentication:** `setup()` logs in once as an ADMIN and every virtual
  user reuses that access token, as a real client would. All virtual users
  share one IP, so the API ran with `AUTH_RATE_LIMIT=100000`; with the
  default of 5 per minute the login scenario would get `429`, which is the
  intended production behaviour.
- **Machine:** Windows 11, 16 logical CPUs, PostgreSQL 16 in Docker Desktop,
  Node.js 22 running the production build (`node dist/main`), k6 v2.4.0 in
  Docker (`grafana/k6`), calling the API through `host.docker.internal`.

## Finding the bottleneck

1. **The API process, not the database, was the limit.** During the steady
   part, the Node.js process used 150–164% of one CPU core: the single
   JavaScript thread was fully busy, and argon2id hashing and I/O ran on
   helper threads. At the same time most of the 10 database pool
   connections were idle (sampled every second from `pg_stat_activity`), so
   requests were waiting for the JavaScript thread, not for PostgreSQL.
2. **The slowest step did the most database work.** With SQL logging on,
   one request of each kind ran:

   | Request | Queries (before) |
   |---|---|
   | `POST /sources` | 1 `INSERT` |
   | `POST …/landmarks` | **2 village `SELECT`s with 2 `JOIN`s each**, 1 source check, 1 `INSERT`, 1 source `SELECT` for the response |
   | `PATCH …/landmarks/:id` | 1 landmark `SELECT`, 1 `UPDATE`, 1 landmark `SELECT`, 1 source `SELECT` |

3. **The village queries were only an existence check.** Landmark creation
   called `VillageService.findOne(villageId)`, which loads the village with
   its governorate and municipality (TypeORM runs two joined queries for
   that), builds the response DTO, and the caller then throws the result
   away. TypeORM builds the SQL and turns the rows into objects on the busy
   JavaScript thread, so this wasted CPU on every call. The same pattern
   was used in 12 places: `create`, `list`, `findOne` and population
   `history` in the population, history, landmark and cultural trait
   services.

## The fix

`VillageService.ensureExists(id)` runs one indexed existence query on the
primary key, without joins, and throws the same `404 Village … not found`
as before:

```ts
async ensureExists(id: string): Promise<void> {
  if (!(await this.villages.existsBy({ id }))) {
    throw new NotFoundException(`Village ${id} not found`);
  }
}
```

The 12 existence checks now call it instead of `findOne`, following the
existing `SourceService.ensureExists`. Landmark creation now runs
**one plain village query instead of two joined ones**. The API response
and the error for an unknown village are unchanged (`404`).

`PATCH` does not check the village, but it also got faster: the shared
JavaScript thread has less work, so every request waits less for it.

## What the fix does not change

- **Login cost** is intentional. argon2id uses 64 MiB and three passes per
  hash to make password guessing expensive (ADR-002). Clients log in once
  and reuse the access token, which is why the write flow does not log in.
- **The single JavaScript thread** is still the limit. The next steps would
  be running several API processes (Node cluster or several containers
  behind a load balancer) and logging less per request; both are outside
  this change.
- **Responses are still loaded after a write** (for example the source of a
  new landmark) so the API can return the full record. Building them from
  data already in memory would save another query per write.

## How to reproduce

```bash
npm run seed && npm run seed:perf        # same data set as the search test
npm run build
# Start the API with an admin account and a high login limit for the test:
ADMIN_EMAIL=k6-admin@example.com ADMIN_PASSWORD='<at least 12 characters>' \
  AUTH_RATE_LIMIT=100000 node dist/main

# In another terminal, with k6 installed:
k6 run -e ADMIN_EMAIL=k6-admin@example.com -e ADMIN_PASSWORD='…' \
  -e LABEL=write k6/authenticated-write.js

# Or with Docker instead of a local k6:
docker run --rm -v "$PWD/k6:/work/k6" -w /work grafana/k6 run \
  -e BASE_URL=http://host.docker.internal:3000 \
  -e ADMIN_EMAIL=k6-admin@example.com -e ADMIN_PASSWORD='…' \
  -e LABEL=write k6/authenticated-write.js

# Remove the rows the test created:
docker compose exec -T db psql -U qaryati -d qaryati \
  < k6/cleanup-authenticated-write.sql
```

The summary is printed and written to `k6/results/<LABEL>.json`
(git-ignored). For a before/after comparison, run the two builds
alternately and compare the medians, as above.
