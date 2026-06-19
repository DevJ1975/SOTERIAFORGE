// Soteria FORGE — k6 load-test configuration.
//
// Single source of truth for base URLs + the project id. Everything is read
// from k6 environment variables (`-e KEY=value` or the host environment) with
// EMULATOR-SUITE DEFAULTS, so the harness runs against the local Firebase
// emulators out of the box and RETARGETS TO PRODUCTION with one change: point
// these env vars at the real endpoints (and flip USE_EMULATOR off).
//
// HONESTY: the defaults target the emulator. This harness proves
// correctness/idempotency (zero-dup / zero-loss / reconciliation) — it does NOT
// prove the 6,000-concurrent prod SLOs, autoscale, warm pools, CDN, or chaos
// behaviour. See README.md "Honesty".
//
// k6 runtime: this is an ES module evaluated by the k6 (goja) JS VM, NOT Node.
// `__ENV` is k6's environment map; there is no `process`.

/** Read an env var with a default. */
function env(key, fallback) {
  const v = __ENV[key];
  return v === undefined || v === '' ? fallback : v;
}

/** Read a boolean-ish env var ("1"/"true"/"yes" → true). */
function envBool(key, fallback) {
  const v = __ENV[key];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

/** Read an integer env var with a default. */
function envInt(key, fallback) {
  const v = __ENV[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

// The Firebase project id. Matches .firebaserc (`soteria-forge-dev`). Override
// with -e PROJECT_ID=... when retargeting to a different / prod project.
export const PROJECT_ID = env('PROJECT_ID', 'soteria-forge-dev');

// Tenant the synthetic learners belong to. Matches the seed (tools/seed).
export const TENANT_ID = env('TENANT_ID', 'atl-airport');

// When true (default) the auth REST calls send the emulator's relaxed handshake
// (any non-empty API key is accepted by the GCIP emulator). For prod, set
// USE_EMULATOR=0 and provide a real WEB_API_KEY.
export const USE_EMULATOR = envBool('USE_EMULATOR', true);

// A web API key. The GCIP emulator ignores its value, so any placeholder works;
// production requires the real Firebase Web API key.
export const WEB_API_KEY = env('WEB_API_KEY', 'fake-emulator-key');

// Base URLs. Emulator defaults map to firebase.json emulator ports:
//   auth 9099, firestore 8080, functions 5001.
// Identity Platform (GCIP) REST surface.
export const AUTH_BASE_URL = env('AUTH_BASE_URL', 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1');

// Firestore REST surface root (the per-document path is appended by lib/firestore.js).
export const FIRESTORE_BASE_URL = env('FIRESTORE_BASE_URL', 'http://127.0.0.1:8080/v1');

// Callable Cloud Functions root: `{root}/{project}/us-central1/{fn}`.
export const FUNCTIONS_BASE_URL = env(
  'FUNCTIONS_BASE_URL',
  'http://127.0.0.1:5001',
);

// Functions region (matches CALLABLE_OPTS in apps/functions/src/main.ts).
export const FUNCTIONS_REGION = env('FUNCTIONS_REGION', 'us-central1');

// ---------------------------------------------------------------------------
// Synthetic learner population
// ---------------------------------------------------------------------------
// Each VU signs up (or signs in) a synthetic learner under TENANT_ID. We derive
// stable emails from the VU id so a re-run reuses the same accounts (sign-in
// instead of sign-up), keeping the run idempotent against the emulator.
export const LEARNER_EMAIL_DOMAIN = env('LEARNER_EMAIL_DOMAIN', 'loadtest.atl-airport.demo');
export const LEARNER_PASSWORD = env('LEARNER_PASSWORD', 'LoadTest!2026');

// The course every synthetic learner emits events against. Matches a seeded
// course id (tools/seed) so reconcile can fold against a real enrollment path.
export const COURSE_ID = env('COURSE_ID', 'atl-ramp-apron-safety');

// ---------------------------------------------------------------------------
// Scenario knobs (overridable per-run via -e)
// ---------------------------------------------------------------------------
// EVENTS_PER_VU — N distinct progress events each VU emits (sync-storm proof).
export const EVENTS_PER_VU = envInt('EVENTS_PER_VU', 8);
// DUPLICATES_PER_VU — M deliberate re-sends of already-sent events (collapse proof).
export const DUPLICATES_PER_VU = envInt('DUPLICATES_PER_VU', 4);
// SHUFFLE — when true, each VU emits its events out of clientSeq order.
export const SHUFFLE_EVENTS = envBool('SHUFFLE_EVENTS', true);

// A bounded list of lesson ids the synthetic events complete. Kept small so the
// folded projection is easy to assert in reconcile.ts.
export const LESSON_IDS = env('LESSON_IDS', 'l1,l2,l3,l4,l5,l6').split(',');

/** Build the Firestore documents path root for one learner's events subcollection. */
export function eventsCollectionPath(tenantId, courseId, uid) {
  return (
    `projects/${PROJECT_ID}/databases/(default)/documents/` +
    `tenants/${tenantId}/courses/${courseId}/enrollments/${uid}/events`
  );
}

/** Build the Firestore document path for one event (keyed by its idempotencyKey). */
export function eventDocPath(tenantId, courseId, uid, idempotencyKey) {
  return `${eventsCollectionPath(tenantId, courseId, uid)}/${idempotencyKey}`;
}

/** Build the Firestore document path for one enrollment. */
export function enrollmentDocPath(tenantId, courseId, uid) {
  return (
    `projects/${PROJECT_ID}/databases/(default)/documents/` +
    `tenants/${tenantId}/courses/${courseId}/enrollments/${uid}`
  );
}

export default {
  PROJECT_ID,
  TENANT_ID,
  USE_EMULATOR,
  WEB_API_KEY,
  AUTH_BASE_URL,
  FIRESTORE_BASE_URL,
  FUNCTIONS_BASE_URL,
  FUNCTIONS_REGION,
  LEARNER_EMAIL_DOMAIN,
  LEARNER_PASSWORD,
  COURSE_ID,
  EVENTS_PER_VU,
  DUPLICATES_PER_VU,
  SHUFFLE_EVENTS,
  LESSON_IDS,
};
