# Performance: village search (read-heavy k6 scenario)

Endpoint: `GET /api/v1/villages/search?q=...&limit=20`
Script: [`k6/search-read-heavy.js`](../../k6/search-read-heavy.js)
Optimization: migration `1795684021136-AddVillageSearchTrigramIndexes`

## Result

| | Before | After | Change |
|---|---:|---:|---:|
| Requests per second | 78.8 | 205.2 | 2.6× more |
| Average response time | 355 ms | 11.6 ms | 31× faster |
| Median (p50) | 376 ms | 1.7 ms | 220× faster |
| p95 | 470 ms | 21.8 ms | 22× faster |
| p99 | 644 ms | 240.5 ms | 2.7× faster |
| Failed requests | 0% | 0% | |

p95 per type of search:

| Search type (share of requests) | Before p95 | After p95 |
|---|---:|---:|
| Exact name, e.g. `برقة` (30%) | 450 ms | 4.2 ms |
| Start of a name, e.g. `سبسط` (30%) | 448 ms | 5.2 ms |
| Middle of a name, e.g. `بربر` (20%) | 451 ms | 7.1 ms |
| Very broad, e.g. `دير`, `Perf` (10%) | 669 ms | 251.9 ms |
| No match, e.g. `زقزقزق` (10%) | 443 ms | 1.9 ms |

In the "after" run the API was no longer the limit. Each virtual user pauses
0.1 to 0.3 s between searches, so 50 users cannot send more than about 240
requests per second. The real capacity is higher than 205 requests per second,
so the response times are the fairer comparison.

## Setup

- **Data:** `npm run seed` plus `npm run seed:perf`: 50,116 villages and
  50,014 alternative names. The synthetic seed is deterministic, so both runs
  used identical data.
- **Load:** 50 virtual users (15 s ramp-up, 60 s steady, 5 s ramp-down),
  0.1 to 0.3 s pause between searches. The search terms are a weighted mix of
  real names, synthetic name parts, very broad terms and terms that match
  nothing (see `QUERIES` in the script).
- **Machine:** one laptop (Apple M5, 10 cores). PostgreSQL 16 in Docker
  (default settings, `work_mem` 4 MB). The API ran from the production build
  (`npm run build`, `node dist/main`). k6 2.4.0 ran on the same machine.
- The only change between the two runs was the migration. The API was not
  restarted and no code changed.

## Why search was slow (before)

The search matches a name anywhere, so it filters with
`normalized(name) LIKE '%text%'`, where `normalized()` lowercases and folds
Arabic letter variants. A normal B-tree index cannot answer a pattern that
starts with `%`. `EXPLAIN ANALYZE` for `q=سبسط` showed three sequential scans:

```
Seq Scan on villages        Rows Removed by Filter: 50115   (name_ar)
Seq Scan on villages        Rows Removed by Filter: 50116   (name_en)
Seq Scan on village_names   Rows Removed by Filter: 50014   (alternative names)
Execution Time: 71.600 ms
```

To find one village, PostgreSQL normalized and compared about 150,000 names.
Every search cost about 70 ms of CPU time, even one that found nothing. With 50
users searching at once the database CPU was saturated, requests queued, and
the response time rose to 350 to 470 ms.

## The fix

`pg_trgm` splits each name into trigrams (overlapping three-letter pieces) and
a GIN index maps each trigram to the rows that contain it. For `LIKE '%text%'`,
PostgreSQL looks up the trigrams of the search text and reads only the rows
that contain all of them.

The migration creates three GIN indexes, one per searched column. Each is built
on **exactly the expression the query filters on**:

```sql
CREATE INDEX idx_villages_name_ar_trgm ON villages
  USING gin ((translate(lower(name_ar), 'أإآٱىة', 'اااايه')) gin_trgm_ops);
-- the same for villages.name_en and village_names.name
```

An index on plain `name_ar` would not be used, because the query compares the
normalized value. `lower()` and `translate()` are immutable functions, so
PostgreSQL allows indexing their result. The SQL of the search query did not
change.

After the migration, the same `q=سبسط` query:

```
Bitmap Index Scan on idx_villages_name_ar_trgm     rows=1
Bitmap Index Scan on idx_villages_name_en_trgm     rows=0
Bitmap Index Scan on idx_village_names_name_trgm   rows=0
Execution Time: 0.341 ms
```

That is 71.6 ms down to 0.34 ms for the query itself. The three indexes take
about 5.6 MB together (2.1 + 1.8 + 1.8 MB) for 100,000 names. Each insert or
rename of a village or alternative name also updates the index, which is cheap
for an occasional editorial write.

## What the index does not fix

1. **Very broad searches** (`Perf` matches all 50,000 synthetic villages;
   `دير` matches about 6,000). When most rows match, reading them in order is
   cheaper than using the index, and PostgreSQL correctly chooses a sequential
   scan for `Perf`. Most of the time then goes into ranking and de-duplicating
   all matches, so the total count can be returned. For `Perf`, 100,000 rows
   are sorted, and with the default `work_mem` of 4 MB the sort spills to disk.
   That is why this group still has p95 of about 250 ms. `Perf` is an artifact
   of the synthetic data: no real search term matches every village. `دير`,
   which matches 6,000 villages, uses the index and takes about 20 ms. Possible
   next steps, not done here: cap the total count, or raise `work_mem` for this
   query.
2. **Two-letter searches** (`q` may be 2 characters). A 2-letter search has no
   complete trigram, so the index cannot narrow it down and PostgreSQL scans
   the tables as before (about 90 ms for `بر`). Raising the minimum length to 3
   would be an API change for the team to decide.

## How to reproduce

```bash
docker compose up -d db
npm run seed && npm run seed:perf      # 50,000 synthetic villages
npm run build && node dist/main        # in a second terminal

# before: undo the index migration (it must be the newest one)
npm run migration:revert
k6 run -e LABEL=before k6/search-read-heavy.js

# after
npm run migration:run
k6 run -e LABEL=after k6/search-read-heavy.js

npm run seed:perf -- --clear           # remove the synthetic data afterwards
```

The full k6 output is written to `k6/results/<LABEL>.json` (git-ignored).
Absolute numbers depend on the machine. The comparison holds when both runs
use the same machine and data.
