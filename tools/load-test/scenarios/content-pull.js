// scenarios/content-pull.js — read-side thundering herd.
//
// After authenticating, the herd pulls its enrollment state (and would, in prod,
// pull course content + videos behind the CDN). Each iteration mints a token,
// then reads its own enrollment doc via the Firestore REST surface under the
// real security rules.
//
// HONESTY: the emulator validates the READ PATH + rules (a learner may read only
// its own enrollment within its tenant) and that the projection is fetchable. It
// does NOT prove CDN cache-hit ratios, edge latency, or Firestore read fan-out at
// 6,000 concurrent — those are prod/CDN concerns (see README "Honesty").
//
// k6 ES module.

import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { ensureSession } from '../lib/auth.js';
import { readEnrollment } from '../lib/firestore.js';
import { TENANT_ID, COURSE_ID, LEARNER_EMAIL_DOMAIN, LEARNER_PASSWORD } from '../config.js';

const enrollmentReads = new Counter('forge_enrollment_reads');

export const options = {
  scenarios: {
    content_pull: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 80 },
        { duration: '1m', target: 80 },
        { duration: '20s', target: 0 },
      ],
      gracefulStop: '20s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:firestore:readEnrollment}': ['p(95)<2000'],
  },
};

export default function contentPull() {
  const vu = exec.vu.idInTest;
  const email = `learner-${vu}@${LEARNER_EMAIL_DOMAIN}`;
  const session = ensureSession(email, LEARNER_PASSWORD);
  if (!session) return;

  const read = readEnrollment(session.idToken, TENANT_ID, COURSE_ID, session.uid);
  // 200 (enrollment exists) or 404 (not enrolled yet) are both VALID reads — the
  // rules allowed the request. A 403 would mean a rules regression.
  const ok = check(read, {
    'content: read authorized': (r) => r.status === 200 || r.status === 404,
  });
  if (ok) enrollmentReads.add(1);
  sleep(1);
}
