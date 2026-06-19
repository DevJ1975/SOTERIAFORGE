// Idempotency-key generation + the duplicate / out-of-order injectors that make
// the sync-storm a PROOF rather than a smoke test.
//
// Frozen contract (libs/shared/src/lib/schemas/primitives.ts):
//   idempotencyKey = /^[A-Za-z0-9_-]{8,200}$/   ← it IS the event document id.
//
// The key must be STABLE for a given logical event so a replay re-writes the
// SAME document id and therefore collapses (zero-dup). We build it
// deterministically from (deviceId, clientSeq) — exactly what the learner's
// offline queue does — so re-sending the same logical event yields the same key.
//
// k6 ES module (no Node crypto guaranteed); we use a small deterministic hash.

import { LESSON_IDS, PROGRESS_EVENT_KINDS } from './shapes.js';

/**
 * Build a deterministic, contract-valid idempotencyKey for a logical event.
 * Same (deviceId, clientSeq) ⇒ same key ⇒ idempotent replay collapses.
 *
 * Shape: `evt-{deviceHash}-{clientSeq}` — only [A-Za-z0-9_-], length 8..200.
 */
export function idempotencyKeyFor(deviceId, clientSeq) {
  const h = djb2(deviceId)
    .toString(36)
    .replace(/[^A-Za-z0-9]/g, '');
  const padded = String(clientSeq).padStart(6, '0');
  const key = `evt-${h}-${padded}`;
  // Defensive: guarantee the frozen regex even for odd inputs.
  return key.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 200);
}

/** Validate against the frozen idempotencyKey regex (mirror of the zod primitive). */
export function isValidIdempotencyKey(key) {
  return /^[A-Za-z0-9_-]{8,200}$/.test(key);
}

/**
 * Build the ORDERED plan of logical events a single VU/device will emit. Each
 * entry is a fully-formed progressEvent payload (matching @forge/shared
 * `progressEvent`) carrying a STABLE idempotencyKey + monotonic clientSeq.
 *
 * @param {object} ctx { uid, tenantId, courseId, deviceId }
 * @param {number} count  N distinct events (EVENTS_PER_VU)
 * @param {string} nowIso ISO timestamp baseline
 */
export function buildEventPlan(ctx, count, nowIso) {
  const plan = [];
  for (let i = 0; i < count; i += 1) {
    const clientSeq = i + 1; // monotonic per device, starts at 1 (> default progressVersion 0)
    const lessonId = LESSON_IDS[i % LESSON_IDS.length];
    // Last event of the run also records a passing score → exercises score_recorded.
    const kind =
      i === count - 1 ? 'course_completed' : i % 4 === 3 ? 'score_recorded' : 'lesson_completed';
    const event = {
      idempotencyKey: idempotencyKeyFor(ctx.deviceId, clientSeq),
      uid: ctx.uid,
      tenantId: ctx.tenantId,
      courseId: ctx.courseId,
      kind,
      clientSeq,
      occurredAt: nowIso,
      deviceId: ctx.deviceId,
      createdAt: nowIso,
    };
    if (kind === 'score_recorded') event.score = 80 + (i % 20); // 80..99
    if (kind === 'lesson_completed') event.lessonId = lessonId;
    plan.push(event);
  }
  return plan;
}

/**
 * THE PROOF MUTATORS.
 *
 * Given an ordered event plan, produce the actual SEND order: inject M
 * duplicates (verbatim re-sends of earlier events — same idempotencyKey) and,
 * when shuffle is on, deterministically permute the order so clientSeq arrives
 * OUT OF ORDER. A correct server must (a) collapse the duplicates and (b) apply
 * the events under the monotonic clientSeq guard so the final projection is the
 * max-clientSeq fold regardless of arrival order.
 *
 * Returns a new array of event payloads (references reused for duplicates).
 */
export function withDuplicatesAndShuffle(plan, duplicates, shuffle) {
  const out = plan.slice();

  // Inject M duplicates: pick deterministic indices spread across the plan and
  // append verbatim copies (identical idempotencyKey ⇒ must collapse).
  for (let d = 0; d < duplicates; d += 1) {
    const idx = plan.length > 0 ? (d * 2 + 1) % plan.length : 0;
    if (plan[idx]) out.push(plan[idx]);
  }

  if (shuffle) {
    // Deterministic in-place permutation (seeded Fisher-Yates) so runs are
    // reproducible. Out-of-order arrival is the point — do not sort.
    let seed = djb2(plan.length + ':' + (plan[0] ? plan[0].deviceId : 'x'));
    for (let i = out.length - 1; i > 0; i -= 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
  }
  return out;
}

/** The de-duplicated, max-clientSeq fold of a SENT sequence — the expected projection. */
export function expectedFold(sentEvents) {
  // De-duplicate by idempotencyKey (last write wins, but payloads are identical).
  const byKey = {};
  for (const e of sentEvents) byKey[e.idempotencyKey] = e;
  const unique = Object.keys(byKey).map((k) => byKey[k]);
  // Apply in clientSeq order under a monotonic guard (mirrors the server fold).
  unique.sort((a, b) => a.clientSeq - b.clientSeq);

  let progressVersion = 0;
  const completedLessonIds = [];
  let completed = false;
  let attemptCount = 0;
  let lastEventKey;
  for (const e of unique) {
    if (e.clientSeq <= progressVersion) continue; // guard rejects stale
    progressVersion = e.clientSeq;
    lastEventKey = e.idempotencyKey;
    if (e.kind === 'lesson_completed' && e.lessonId && completedLessonIds.indexOf(e.lessonId) < 0) {
      completedLessonIds.push(e.lessonId);
    }
    if (e.kind === 'course_completed') completed = true;
    if (e.kind === 'score_recorded') attemptCount += 1;
  }
  return { progressVersion, completedLessonIds, completed, attemptCount, lastEventKey };
}

/** Tiny deterministic string hash (djb2). Stable across the k6 + Node runtimes. */
export function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
  }
  return h >>> 0;
}

export { PROGRESS_EVENT_KINDS };
