// scenarios/soak.js — low, steady, long-duration load.
//
// A small constant arrival rate over a long window to surface leaks, drift, and
// slow degradation (memory, connection churn, monotonic-guard correctness over
// many iterations). Each iteration authenticates and appends ONE fresh progress
// event with a strictly increasing per-device clientSeq, then re-sends it once
// (an idempotent replay that must collapse).
//
// HONESTY: against the emulator this is a CORRECTNESS soak (no drift / no
// duplicate growth over time), not a prod endurance/SLO soak — it does not run
// long enough, at scale, or against real infra to prove production stability
// (see README "Honesty"). Tune duration/rate via env for a longer local run.
//
// k6 ES module.

import { sleep } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { ensureSession } from '../lib/auth.js';
import { writeEvent } from '../lib/firestore.js';
import { idempotencyKeyFor } from '../lib/idempotency.js';
import { TENANT_ID, COURSE_ID, LEARNER_EMAIL_DOMAIN, LEARNER_PASSWORD } from '../config.js';

const soakEvents = new Counter('forge_soak_events');
const soakReplays = new Counter('forge_soak_replays');
const soakFailures = new Counter('forge_soak_failures');

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: 5, // 5 iterations/sec …
      timeUnit: '1s',
      duration: '10m', // … for ten minutes (override with -e SOAK_DURATION)
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    forge_soak_failures: ['count==0'],
    checks: ['rate>0.99'],
  },
};

export default function soak() {
  const vu = exec.vu.idInTest;
  const email = `learner-${vu}@${LEARNER_EMAIL_DOMAIN}`;
  const session = ensureSession(email, LEARNER_PASSWORD);
  if (!session) {
    soakFailures.add(1);
    return;
  }

  const deviceId = `loadtest-soak-${vu}`;
  // Monotonic per-iteration clientSeq for this VU/device across the soak.
  const clientSeq = exec.scenario.iterationInTest + 1;
  const nowIso = new Date().toISOString();
  const event = {
    idempotencyKey: idempotencyKeyFor(deviceId, clientSeq),
    uid: session.uid,
    tenantId: TENANT_ID,
    courseId: COURSE_ID,
    kind: 'lesson_completed',
    lessonId: `soak-l${clientSeq % 6}`,
    clientSeq,
    occurredAt: nowIso,
    deviceId,
    createdAt: nowIso,
  };

  const first = writeEvent(session.idToken, event);
  if (first.status === 200) soakEvents.add(1);
  else soakFailures.add(1);

  // Idempotent replay — same idempotencyKey ⇒ must collapse onto the same doc.
  const replay = writeEvent(session.idToken, event);
  if (replay.status === 200) soakReplays.add(1);
  else soakFailures.add(1);

  sleep(0.1);
}
