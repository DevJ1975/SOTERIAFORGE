// scenarios/login-storm.js — authentication thundering herd.
//
// Models the shift-change moment when thousands of devices wake and
// authenticate at once. Each iteration mints an ID token against the Auth
// emulator (sign-up first run, sign-in thereafter) — the same GCIP REST surface
// production uses.
//
// HONESTY: against the emulator this proves the harness + auth handshake are
// correct and that token minting is the gate before any Firestore write. It does
// NOT prove the real GCIP service can absorb 6,000 concurrent sign-ins, nor its
// quota/backoff behaviour — that needs the prod project (see README "Honesty").
//
// k6 ES module.

import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { ensureSession } from '../lib/auth.js';
import { LEARNER_EMAIL_DOMAIN, LEARNER_PASSWORD } from '../config.js';

const tokensMinted = new Counter('forge_tokens_minted');

export const options = {
  scenarios: {
    login_storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 }, // spike: everyone wakes at the bell
        { duration: '2m', target: 100 }, // ramp / sustained shift-change window
        { duration: '10s', target: 0 }, // settle
      ],
      gracefulStop: '20s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    'http_req_duration{name:auth:signInWithPassword}': ['p(95)<2000'],
  },
};

export default function loginStorm() {
  const vu = exec.vu.idInTest;
  const email = `learner-${vu}@${LEARNER_EMAIL_DOMAIN}`;
  const session = ensureSession(email, LEARNER_PASSWORD);
  const ok = check(session, { 'login: token present': (s) => !!s && !!s.idToken });
  if (ok) tokensMinted.add(1);
  sleep(1);
}
