# Performance: public Heritage listings

**Status: 60-record-per-village-per-type baseline benchmark completed on
November 27, 2026.** This is a baseline, not an optimization comparison.

The run used Grafana k6 v2.4.0 on Windows against the local Qaryati NestJS
production build. PostgreSQL 16 ran in Docker on port 5433, using the isolated
`qaryati_perf` database.

The benchmark covers the public, paginated list endpoints:

- `GET /api/v1/villages/:villageId/landmarks`
- `GET /api/v1/villages/:villageId/cultural-traits`

Both endpoints return only VERIFIED records and include source information in
each item. Their optional `type` filters use the Landmark and Cultural Trait
enum values from the API.

## Workload

[`k6/heritage-read-heavy.js`](../../k6/heritage-read-heavy.js) randomly
distributes requests evenly between the two endpoints. For each endpoint it
uses a mix of:

- Unfiltered listing, first page, 20 items.
- Type-filtered listing, first page, 20 items.
- Unfiltered second page, 10 items.

The k6 scenario ramps from 0 to 50 virtual users over 15 seconds, holds 50
users for 60 seconds, and ramps down over 5 seconds. Each virtual user waits
0.1–0.3 seconds between requests. The script checks for HTTP 200, a non-empty
`data` array, and valid `meta` pagination values. Empty results fail the
checks threshold.

The full k6 summary is written to the git-ignored `k6/results/<LABEL>.json`;
the script also prints request throughput, failed-request rate, and average,
p50, p95, and p99 latency overall, per endpoint, and by query group.

## Dataset

[`npm run seed:perf:heritage`](../../src/database/seeds/run-heritage-perf-seed.ts)
adds 60 VERIFIED landmarks and 60 VERIFIED cultural traits per selected
village by default. It cycles through each table's actual enum values, giving
each type enough records to return results. The minimum configurable count is
20 per table per village, so the second page of 10 items is populated.

The fixture defaults to five existing synthetic villages named `PERF Village
...`, created by the existing performance village seed. It creates dedicated
Source rows and prints a comma-separated `VILLAGE_IDS=...` line for the k6
command. Village count is configurable from 1 to 20 with `--villages`;
records per village are configurable from 20 to 2,000 with
`--records-per-village`.

After setting the required `qaryati_perf` environment variables described
under Local setup and creating five synthetic villages, run:

```bash
npm run seed:perf:heritage -- --villages 5 --records-per-village 2000
```

This generates 10,000 VERIFIED landmarks and 10,000 VERIFIED cultural traits
(20,000 Heritage records total). The seed keeps
`DEFAULT_RECORDS_PER_VILLAGE = 60`, so the original dataset can still be
reproduced with `npm run seed:perf:heritage`. Record numbers from 1 through
2,000 are included in each name, keeping names distinct within each village;
the generated names fit the 255-character name columns.

The results below apply only to the 60-record-per-village-per-type dataset.
A new baseline using 2,000 records per village per type is required before
adding indexes; no results for that expanded dataset are available yet.

The benchmark dataset contained five synthetic villages, with 60 VERIFIED
landmarks and 60 VERIFIED cultural traits per village: 300 records of each
type in total.

The fixture refuses production, requires the explicitly configured
`DB_NAME=qaryati_perf` and loopback `DB_HOST`, and requires the explicit
opt-in `ALLOW_HERITAGE_PERF_SEED=true` before connecting. It verifies
`current_database()` before writing and disables automatic migrations.
Repeated seed runs replace only its marked Heritage records. `--clear`
removes those records and removes a fixture Source only when no records
reference it; it does not delete villages or unrelated Heritage, Source,
Population, History, or Village Name data.

These checks do not prove where PostgreSQL is physically running. In
particular, `localhost` port forwarding from Windows or Docker can route to a
remote server. Confirm that the configured forwarding targets the intended
local development database before setting the opt-in variable; the fixture
does not infer locality from PostgreSQL's server-side socket address.

## Local setup and reproduction

Use only a dedicated local `qaryati_perf` database. Do not point these
commands at a shared or production database. The Git Bash commands below use
the default local Compose username and port; substitute the values from your
local `.env` if they differ.

Create the database once (skip this if it already exists):

```bash
docker compose up -d db
docker compose exec db createdb -U qaryati qaryati_perf
```

In the Git Bash session used for database setup and fixture commands, set the
target explicitly, apply migrations, seed reference data, then create the
synthetic villages and Heritage records:

```bash
export DB_HOST=localhost
export DB_PORT=5433
export DB_NAME=qaryati_perf
export DB_RUN_MIGRATIONS=false
export ALLOW_HERITAGE_PERF_SEED=true

npm run migration:run
npm run seed
npm run seed:perf -- --count 5
npm run seed:perf:heritage
```

Run `npm run seed:perf -- --count 5` once when this database has no synthetic
villages. That existing command adds the requested count; rerunning it adds
more villages. The standard seed command creates the reference data required
by the performance fixture.

The fixture prints the village UUIDs needed below. To change the dataset size,
pass `--villages N` and/or `--records-per-village N` to
`npm run seed:perf:heritage`.

In a second Git Bash session, set the same database variables before starting
the API so it reads from `qaryati_perf` without running migrations on startup:

```bash
export DB_HOST=localhost
export DB_PORT=5433
export DB_NAME=qaryati_perf
export DB_RUN_MIGRATIONS=false

npm run build
npm run start:prod
```

Create the ignored results directory if it does not exist, then run k6 from
the repository root. Replace the UUID placeholders with the IDs printed by
the fixture:

```bash
mkdir -p k6/results
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e LABEL=heritage-local \
  -e VILLAGE_IDS=uuid1,uuid2,uuid3,uuid4,uuid5 \
  k6/heritage-read-heavy.js
```

After the run, clean up only the fixture's Heritage records and unreferenced
fixture sources, using the same explicit local database variables in the
Git Bash session, including `ALLOW_HERITAGE_PERF_SEED=true`:

```bash
export DB_HOST=localhost
export DB_PORT=5433
export DB_NAME=qaryati_perf
export DB_RUN_MIGRATIONS=false
export ALLOW_HERITAGE_PERF_SEED=true

npm run seed:perf:heritage -- --clear
```

The fixture does not remove its synthetic villages; those remain available
for other local performance tests.

## Results: 60-record-per-village-per-type baseline

| Metric                       |                         Result |
| ---------------------------- | -----------------------------: |
| Label                        |               `heritage-local` |
| Requests                     |                         16,260 |
| Throughput                   |         202.62 requests/second |
| HTTP failure rate            |                             0% |
| Response checks              | 97,560 passed, 0 failed (100%) |
| Overall maximum latency      |                      131.32 ms |
| `checks: rate>0.999`         |                         Passed |
| `http_req_failed: rate<0.01` |                         Passed |

| Endpoint        |  Average |      p50 |      p95 |      p99 |
| --------------- | -------: | -------: | -------: | -------: |
| Overall         | 13.91 ms | 10.63 ms | 32.35 ms | 60.12 ms |
| Landmarks       | 13.43 ms | 10.25 ms | 31.67 ms | 57.66 ms |
| Cultural Traits | 14.37 ms | 10.99 ms | 33.12 ms | 61.89 ms |

| Request group                  |      p95 |
| ------------------------------ | -------: |
| Landmarks, unfiltered          | 33.88 ms |
| Landmarks, type-filtered       | 26.21 ms |
| Landmarks, pagination          | 33.31 ms |
| Cultural Traits, unfiltered    | 34.97 ms |
| Cultural Traits, type-filtered | 33.81 ms |
| Cultural Traits, pagination    | 31.15 ms |

This run completed 16,260 requests at 202.62 requests per second, with no
HTTP failures and all response checks passing. Cultural Traits had slightly
higher average, p95, and p99 latency than Landmarks in this run. Subgroup p95
latencies varied across request types. These results are a baseline only,
not an optimization comparison; they do not establish a speedup or maximum
system capacity.

## Scope and limitations

Testing empty lists alone would be misleading: the database can return an
empty page without exercising collection transfer, response shaping, or
pagination over actual records. The script therefore requires non-empty data
on every request and fails its checks threshold otherwise.

Verification endpoints are excluded because this is a read-heavy scenario.
Landmark and Cultural Trait verify/reject routes are enabled and require an
authenticated `VERIFIER` or `ADMIN`; they are not part of this benchmark's
read workload.

The measured dataset is deliberately limited to five synthetic villages and
300 records of each Heritage type. These results may not generalize to larger
or different datasets or deployments. Results also depend on the machine,
PostgreSQL and API configuration, and whether k6, the API, and the database
share a host.
