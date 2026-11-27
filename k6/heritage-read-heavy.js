// Read-heavy load test for public Landmark and Cultural Trait listings.
//
//   k6 run -e VILLAGE_IDS=<comma-separated UUIDs> k6/heritage-read-heavy.js
//   k6 run -e BASE_URL=http://localhost:3000 -e LABEL=local \
//     -e VILLAGE_IDS=<comma-separated UUIDs> k6/heritage-read-heavy.js
//
// VILLAGE_IDS is printed by npm run seed:perf:heritage. Each response must
// contain verified data; empty lists fail the checks threshold.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(
  /\/+$/,
  '',
);
const LABEL = (__ENV.LABEL || 'run').replace(/[^A-Za-z0-9._-]/g, '_') || 'run';
const VILLAGE_IDS = (__ENV.VILLAGE_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (VILLAGE_IDS.length === 0) {
  throw new Error(
    'Set VILLAGE_IDS to the comma-separated UUIDs printed by the Heritage performance fixture.',
  );
}
if (
  VILLAGE_IDS.some(
    (id) =>
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ),
  )
) {
  throw new Error('VILLAGE_IDS must contain valid UUIDs separated by commas.');
}

const LANDMARK_TYPES = [
  'SPRING',
  'RELIGIOUS_SITE',
  'ARCHAEOLOGICAL_SITE',
  'OLD_BUILDING',
  'VIEWPOINT',
];
const CULTURAL_TRAIT_TYPES = ['CRAFT', 'FOOD', 'FARMING_PRACTICE'];
const QUERY_GROUPS = ['unfiltered', 'type_filtered', 'pagination'];

const overallLatency = new Trend('heritage_request_duration', true);
const landmarkLatency = new Trend('landmark_request_duration', true);
const culturalTraitLatency = new Trend('cultural_trait_request_duration', true);
const subgroupLatencies = {
  landmarks: {
    unfiltered: new Trend('landmarks_unfiltered_duration', true),
    type_filtered: new Trend('landmarks_type_filtered_duration', true),
    pagination: new Trend('landmarks_pagination_duration', true),
  },
  cultural_traits: {
    unfiltered: new Trend('cultural_traits_unfiltered_duration', true),
    type_filtered: new Trend('cultural_traits_type_filtered_duration', true),
    pagination: new Trend('cultural_traits_pagination_duration', true),
  },
};

export const options = {
  scenarios: {
    heritage: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.999'],
    heritage_request_duration: ['max>=0'],
    landmark_request_duration: ['max>=0'],
    cultural_trait_request_duration: ['max>=0'],
    landmarks_unfiltered_duration: ['max>=0'],
    landmarks_type_filtered_duration: ['max>=0'],
    landmarks_pagination_duration: ['max>=0'],
    cultural_traits_unfiltered_duration: ['max>=0'],
    cultural_traits_type_filtered_duration: ['max>=0'],
    cultural_traits_pagination_duration: ['max>=0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickQueryGroup() {
  const roll = Math.random();
  if (roll < 0.4) return 'unfiltered';
  if (roll < 0.7) return 'type_filtered';
  return 'pagination';
}

function latencySummary(metric) {
  if (!metric || !metric.values) return null;
  return {
    avg: metric.values.avg,
    p50: metric.values.med,
    p95: metric.values['p(95)'],
    p99: metric.values['p(99)'],
  };
}

export default function () {
  const endpoint = Math.random() < 0.5 ? 'landmarks' : 'cultural_traits';
  const route = endpoint === 'landmarks' ? 'landmarks' : 'cultural-traits';
  const queryGroup = pickQueryGroup();
  const villageId = pick(VILLAGE_IDS);
  let page = 1;
  let limit = 20;
  let query = '';

  if (queryGroup === 'type_filtered') {
    const types =
      endpoint === 'landmarks' ? LANDMARK_TYPES : CULTURAL_TRAIT_TYPES;
    query = `&type=${pick(types)}`;
  } else if (queryGroup === 'pagination') {
    page = 2;
    limit = 10;
  }

  const url =
    `${BASE_URL}/api/v1/villages/${villageId}/${route}` +
    `?page=${page}&limit=${limit}${query}`;
  const response = http.get(url, {
    tags: {
      endpoint,
      query: queryGroup,
      name: `GET /villages/:villageId/${route}`,
    },
  });
  const duration = response.timings.duration;

  overallLatency.add(duration);
  if (endpoint === 'landmarks') {
    landmarkLatency.add(duration);
    subgroupLatencies.landmarks[queryGroup].add(duration);
  } else {
    culturalTraitLatency.add(duration);
    subgroupLatencies.cultural_traits[queryGroup].add(duration);
  }

  let payload = null;
  try {
    payload = response.json();
  } catch {
    // The response checks below record invalid JSON as a failed check.
  }
  const data = payload && payload.data;
  const meta = payload && payload.meta;

  check(response, {
    'status is 200': (res) => res.status === 200,
    'has data array': () => Array.isArray(data),
    'has non-empty data array': () => Array.isArray(data) && data.length > 0,
    'does not exceed page limit': () =>
      Array.isArray(data) && data.length <= limit,
    'has valid pagination metadata': () =>
      meta !== null &&
      typeof meta === 'object' &&
      Number.isInteger(meta.page) &&
      Number.isInteger(meta.limit) &&
      Number.isInteger(meta.total) &&
      Number.isInteger(meta.totalPages),
    'pagination matches request': () =>
      meta !== null &&
      typeof meta === 'object' &&
      meta.page === page &&
      meta.limit === limit &&
      meta.total > 0 &&
      meta.totalPages >= page,
  });

  sleep(Math.random() * 0.2 + 0.1);
}

export function handleSummary(data) {
  const endpoints = {
    landmarks: latencySummary(data.metrics.landmark_request_duration),
    culturalTraits: latencySummary(
      data.metrics.cultural_trait_request_duration,
    ),
  };
  const subgroups = {
    landmarks: {
      unfiltered: latencySummary(data.metrics.landmarks_unfiltered_duration),
      typeFiltered: latencySummary(
        data.metrics.landmarks_type_filtered_duration,
      ),
      pagination: latencySummary(data.metrics.landmarks_pagination_duration),
    },
    culturalTraits: {
      unfiltered: latencySummary(
        data.metrics.cultural_traits_unfiltered_duration,
      ),
      typeFiltered: latencySummary(
        data.metrics.cultural_traits_type_filtered_duration,
      ),
      pagination: latencySummary(
        data.metrics.cultural_traits_pagination_duration,
      ),
    },
  };
  const summary = {
    label: LABEL,
    requests: data.metrics.http_reqs.values.count,
    requestsPerSecond: data.metrics.http_reqs.values.rate,
    failedRequestRate: data.metrics.http_req_failed.values.rate,
    latency: latencySummary(data.metrics.heritage_request_duration),
    endpoints,
    subgroups,
  };

  return {
    stdout: `\n${LABEL}: ${JSON.stringify(summary, null, 2)}\n`,
    [`k6/results/${LABEL}.json`]: JSON.stringify(data, null, 2),
  };
}
