// scenarios/sync-storm.js — THE CORRECTNESS PROOF.
//
// Models the shift-change "thundering herd": many learners flush their offline
// progress queues at once. Each VU (= one learner+device):
//   1. mints an ID token (Auth emulator),
//   2. builds a plan of N distinct progress events with STABLE idempotencyKeys
//      (deterministic from deviceId+clientSeq — exactly what the offline queue
//      does, so a replay re-writes the SAME doc id),
//   3. injects M verbatim DUPLICATES (same idempotencyKey) and SHUFFLES the send
//      order so clientSeq arrives OUT OF ORDER,
//   4. writes every event via the Firestore REST upsert at the contract path
//      tenants/{t}/courses/{c}/enrollments/{u}/events/{idempotencyKey}.
//
// What this proves (verified AFTER the run by reconcile.ts, not in k6):
//   • zero-dup  — duplicate sends collapse onto one event doc (same id), so the
//     server-folded projection is unaffected by re-sends.
//   • zero-loss — every distinct event is durably appended; the projection
//     equals the de-duplicated, max-clientSeq fold regardless of arrival order.
// k6 only asserts the WRITES succeeded; correctness of the fold is reconcile's
// job (run `npm run loadtest:reconcile` after this scenario).
//
// k6 ES module.

import { sleep } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { ensureSession } from '../lib/auth.js';
import { writeEvent } from '../lib/firestore.js';
import {
  buildEventPlan,
  withDuplicatesAndShuffle,
  isValidIdempotencyKey,
} from '../lib/idempotency.js';
import {
  TENANT_ID,
  COURSE_ID,
  LEARNER_EMAIL_DOMAIN,
  LEARNER_PASSWORD,
  EVENTS_PER_VU,
  DUPLICATES_PER_VU,
  SHUFFLE_EVENTS,
} from '../config.js';

const eventsSent = new Counter('forge_events_sent');
const duplicatesSent = new Counter('forge_duplicates_sent');
const writeFailures = new Counter('forge_write_failures');

export const options = {
  scenarios: {
    sync_storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 }, // burst: queues flush at the bell
        { duration: '45s', target: 50 }, // sustained herd
        { duration: '15s', target: 0 }, // drain
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: {
    // Every write must succeed for the zero-loss claim to hold.
    forge_write_failures: ['count==0'],
    checks: ['rate>0.99'],
  },
};

export default function syncStorm() {
  const vu = exec.vu.idInTest;
  const email = `learner-${vu}@${LEARNER_EMAIL_DOMAIN}`;
  const deviceId = `loadtest-device-${vu}`;

  const session = ensureSession(email, LEARNER_PASSWORD);
  if (!session) return; // auth failure already recorded by the check

  const nowIso = new Date().toISOString();
  const ctx = { uid: session.uid, tenantId: TENANT_ID, courseId: COURSE_ID, deviceId };

  const plan = buildEventPlan(ctx, EVENTS_PER_VU, nowIso);
  const sendOrder = withDuplicatesAndShuffle(plan, DUPLICATES_PER_VU, SHUFFLE_EVENTS);

  const seenKeys = {};
  for (const event of sendOrder) {
    if (!isValidIdempotencyKey(event.idempotencyKey)) {
      writeFailures.add(1);
      continue;
    }
    const res = writeEvent(session.idToken, event);
    if (res.status === 200) {
      if (seenKeys[event.idempotencyKey]) duplicatesSent.add(1);
      else {
        seenKeys[event.idempotencyKey] = true;
        eventsSent.add(1);
      }
    } else {
      writeFailures.add(1);
    }
    // Small think-time so the herd is realistic, not a tight loop.
    sleep(0.05);
  }
}
