// Authenticated write load test: login + create/update with a bearer token.
//
//   k6 run -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... k6/authenticated-write.js
//   k6 run -e BASE_URL=http://localhost:3000 -e LABEL=after ... k6/authenticated-write.js
//
// Needs an EDITOR or ADMIN account (e.g. the first admin from ADMIN_EMAIL /
// ADMIN_PASSWORD in .env) and the synthetic data set (npm run seed:perf).
// All virtual users share one IP, so start the API with a high
// AUTH_RATE_LIMIT for this test (see docs/performance/write.md).
// Created rows start with "K6-WRITE"; remove them with
// k6/cleanup-authenticated-write.sql. The summary is written to
// k6/results/<LABEL>.json (git-ignored).
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const LABEL = __ENV.LABEL || 'write';
const API = `${BASE_URL}/api/v1`;
const PREFIX = 'K6-WRITE';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Completed source + create + update flows (all three steps succeeded).
const writeFlows = new Counter('write_flows');

// One name per step, so the summary lists p95 per endpoint.
const STEPS = [
  'POST /sources',
  'POST /villages/:id/landmarks',
  'PATCH /villages/:id/landmarks/:id',
  'POST /auth/login',
];

export const options = {
  scenarios: {
    // The part we compare: 50 editors writing with an existing token.
    writes: {
      executor: 'ramping-vus',
      exec: 'writeFlow',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 }, // warm up
        { duration: '60s', target: 50 }, // steady load
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '5s',
    },
    // People logging in at the same time, at a steady 2 logins per second.
    logins: {
      executor: 'constant-arrival-rate',
      exec: 'loginFlow',
      rate: 2,
      timeUnit: '1s',
      duration: '80s',
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Register one sub-metric per step, so the summary lists them.
for (const step of STEPS) {
  options.thresholds[`http_req_duration{name:${step}}`] = ['max>=0'];
}

function credentials() {
  const email = __ENV.ADMIN_EMAIL;
  const password = __ENV.ADMIN_PASSWORD;
  if (!email || !password) {
    fail('Set -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... (an EDITOR or ADMIN)');
  }
  return JSON.stringify({ email, password });
}

// Runs once: log in and pick the villages to write into. Real clients log in
// once and reuse the access token, so the write flow does not log in.
export function setup() {
  const login = http.post(`${API}/auth/login`, credentials(), {
    headers: JSON_HEADERS,
  });
  if (login.status !== 200) {
    fail(`Login failed with ${login.status}: ${login.body}`);
  }

  const villageIds = [];
  for (let page = 1; page <= 5; page++) {
    const res = http.get(`${API}/villages?limit=100&page=${page}`);
    for (const village of res.json('data')) villageIds.push(village.id);
  }
  if (villageIds.length === 0) fail('No villages: run npm run seed:perf');

  return { token: login.json('accessToken'), villageIds };
}

export function writeFlow(data) {
  const params = (name) => ({
    headers: { ...JSON_HEADERS, Authorization: `Bearer ${data.token}` },
    tags: { name },
  });
  const tag = `${PREFIX} ${__VU}-${__ITER}`;
  const villageId =
    data.villageIds[Math.floor(Math.random() * data.villageIds.length)];

  // 1. The source the new record cites.
  const source = http.post(
    `${API}/sources`,
    JSON.stringify({ title: `${tag} source`, type: 'BOOK', year: 1945 }),
    params(STEPS[0]),
  );
  if (!check(source, { 'source created': (r) => r.status === 201 })) return;

  // 2. A new landmark: checks the village and source exist, then inserts.
  const landmark = http.post(
    `${API}/villages/${villageId}/landmarks`,
    JSON.stringify({
      name: `${tag} spring`,
      type: 'SPRING',
      description: 'Created by the k6 authenticated write test.',
      sourceId: source.json('id'),
    }),
    params(STEPS[1]),
  );
  if (!check(landmark, { 'landmark created': (r) => r.status === 201 })) {
    return;
  }

  // 3. An editor corrects the description while it is still PENDING.
  const update = http.patch(
    `${API}/villages/${villageId}/landmarks/${landmark.json('id')}`,
    JSON.stringify({ description: 'Corrected by the k6 write test.' }),
    params(STEPS[2]),
  );
  if (check(update, { 'landmark updated': (r) => r.status === 200 })) {
    writeFlows.add(1);
  }

  // Think time between two edits of one user.
  sleep(Math.random() * 0.2 + 0.1);
}

export function loginFlow() {
  const res = http.post(`${API}/auth/login`, credentials(), {
    headers: JSON_HEADERS,
    tags: { name: STEPS[3] },
  });
  check(res, { 'login ok': (r) => r.status === 200 });
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

  const steps = {};
  for (const step of STEPS) {
    steps[step] = pick(`http_req_duration{name:${step}}`);
  }

  const summary = {
    label: LABEL,
    requests: data.metrics.http_reqs.values.count,
    requestsPerSecond: data.metrics.http_reqs.values.rate,
    failedRate: data.metrics.http_req_failed.values.rate,
    writeFlows: data.metrics.write_flows
      ? data.metrics.write_flows.values.count
      : 0,
    writeFlowsPerSecond: data.metrics.write_flows
      ? data.metrics.write_flows.values.rate
      : 0,
    duration: pick('http_req_duration'),
    steps,
  };

  return {
    stdout: `\n${LABEL}: ${JSON.stringify(summary, null, 2)}\n`,
    [`k6/results/${LABEL}.json`]: JSON.stringify(data, null, 2),
  };
}
