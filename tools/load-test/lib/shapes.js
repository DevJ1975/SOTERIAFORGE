// Plain-JS mirrors of the @forge/shared progress contract, for the k6 runtime.
//
// k6 scripts run in the goja JS VM and CANNOT import the TypeScript
// `@forge/shared` package. These constants intentionally DUPLICATE the frozen
// shapes so the k6 payloads stay valid. The authoritative definitions live in
// libs/shared/src/lib/schemas/{primitives,progress}.ts — keep these in sync if
// the contract ever changes (reconcile.ts imports the real @forge/shared, so a
// drift there will surface in the reconciliation assertion).

/** progressEvent.kind enum (libs/shared/src/lib/schemas/progress.ts). */
export const PROGRESS_EVENT_KINDS = [
  'lesson_completed',
  'course_completed',
  'score_recorded',
];

/** Default lesson id pool the synthetic events complete. */
export const LESSON_IDS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];

/** The frozen idempotencyKey regex (primitives.ts). */
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,200}$/;
