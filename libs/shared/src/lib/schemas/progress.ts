import { z } from 'zod';
import { count, docId, idempotencyKey, isoDateTime, tenantId, uid } from './primitives';

/**
 * Append-only progress event, keyed by its own `idempotencyKey` document id at
 *
 *   /tenants/{tenantId}/courses/{courseId}/enrollments/{uid}/events/{idempotencyKey}
 *
 * A replay re-writes the same doc id ⇒ collapses (the idempotency property the
 * sync-storm must prove). The enrollment doc is a server-derived projection of
 * these events, advanced under a monotonic `progressVersion`/`clientSeq` guard.
 */

/** The kinds of progress event a client may append. */
export const PROGRESS_EVENT_KINDS = [
  'lesson_completed',
  'course_completed',
  'score_recorded',
] as const;
export type ProgressEventKind = (typeof PROGRESS_EVENT_KINDS)[number];

export const progressEvent = z.object({
  /** Client-generated; equals the event document id. */
  idempotencyKey,
  uid,
  tenantId,
  courseId: docId,
  kind: z.enum(PROGRESS_EVENT_KINDS),
  /** Present for lesson-scoped events. */
  lessonId: docId.optional(),
  /** Present for score-recording events. */
  score: z.number().min(0).max(100).optional(),
  /** Monotonic per-device sequence → ordering + projection guard. */
  clientSeq: count,
  /** Client clock when the event occurred (advisory). */
  occurredAt: isoDateTime,
  /** Stable per-device id; reused across this device's events. */
  deviceId: z.string().min(1),
  /** Server-authoritative timestamp on the aggregate. */
  createdAt: isoDateTime,
});
export type ProgressEvent = z.infer<typeof progressEvent>;
