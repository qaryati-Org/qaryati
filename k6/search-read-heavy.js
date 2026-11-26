// Read-heavy load test for GET /api/v1/villages/search.
//
//   k6 run k6/search-read-heavy.js
//   k6 run -e BASE_URL=http://localhost:3000 -e LABEL=after k6/search-read-heavy.js
//
// Run it against the synthetic data set (npm run seed:perf), so that the
// search has to work through about 50,000 villages and 50,000 alternative
// names. The summary is written to k6/results/<LABEL>.json (git-ignored).
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LABEL = __ENV.LABEL || 'run';

// What people type, grouped by how the search has to treat it. Each request
// is tagged with its group, so the summary shows p95 per group as well.
const QUERIES = {
  // Real village names from the reference seed (npm run seed).
  exact: ['برقة', 'سبسطية', 'بيت ساحور', 'Sebastia', 'Bethany', 'Tekoa'],
  // The beginning of a name, as typed into a search box.
  prefix: [
    'سبسط',
    'بيت سا',
    'Beit Sa',
    'Perf Translit 4242',
    'PERF Village 1234',
  ],
  // A part from the middle of a name.
  contains: ['بربر', 'نارو', 'عمصو', 'Translit 777', 'Village 31415'],
  // Matches thousands of rows: the ranking and the count dominate.
  common: ['كفر', 'دير', 'Perf'],
  // Matches nothing: the whole table has to be checked without an index.
  miss: ['زقزقزق', 'xqzvw', 'Nowhere Town'],
};

// Most searches are specific; a few are very broad or find nothing.
const WEIGHTS = [
  ['exact', 30],
  ['prefix', 30],
  ['contains', 20],
  ['common', 10],
  ['miss', 10],
];
const TOTAL_WEIGHT = WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);

function pickGroup() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [group, weight] of WEIGHTS) {
    roll -= weight;
    if (roll < 0) return group;
  }
  return WEIGHTS[0][0];
}

export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 }, // warm up
        { duration: '60s', target: 50 }, // steady load: the part we compare
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Register one sub-metric per group, so the summary lists p95 per group.
for (const [group] of WEIGHTS) {
  options.thresholds[`http_req_duration{group:${group}}`] = ['max>=0'];
}

export default function () {
  const group = pickGroup();
  const terms = QUERIES[group];
  const q = terms[Math.floor(Math.random() * terms.length)];

  const res = http.get(
    `${BASE_URL}/api/v1/villages/search?q=${encodeURIComponent(q)}&limit=20`,
    { tags: { group, name: 'GET /villages/search' } },
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has data array': (r) => Array.isArray(r.json('data')),
  });

  // Think time between searches of one user.
  sleep(Math.random() * 0.2 + 0.1);
}

export function handleSummary(data) {
  const pick = (metric) => {
    const values = data.metrics[metric] && data.metrics[metric].values;
    return values
      ? {
          avg: values.avg,
          med: values.med,
          p95: values['p(95)'],
          p99: values['p(99)'],
          max: values.max,
        }
      : null;
  };

  const groups = {};
  for (const [group] of WEIGHTS) {
    groups[group] = pick(`http_req_duration{group:${group}}`);
  }

  const summary = {
    label: LABEL,
    requests: data.metrics.http_reqs.values.count,
    requestsPerSecond: data.metrics.http_reqs.values.rate,
    failedRate: data.metrics.http_req_failed.values.rate,
    duration: pick('http_req_duration'),
    groups,
  };

  return {
    stdout: `\n${LABEL}: ${JSON.stringify(summary, null, 2)}\n`,
    [`k6/results/${LABEL}.json`]: JSON.stringify(data, null, 2),
  };
}
