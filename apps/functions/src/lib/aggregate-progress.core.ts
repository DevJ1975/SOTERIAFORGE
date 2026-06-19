import type { ProgressEvent } from '@forge/shared';

/**
 * Authoritative server fold: project an append-only `progressEvent` onto the
 * enrollment doc under a monotonic `progressVersion` guard.
 *
 * This is the *source of truth*. The client's optimistic apply (Lane B/C) is a
 * UX accelerant; this trigger reconciles the enrollment from the durable event
 * regardless of client behavior, so replays and out-of-order arrivals converge
 * to the same projection.
 *
 * Guard: an event whose `clientSeq <= existing.progressVersion` has already been
 * folded (replay or stale reorder) and is ignored. Otherwise we merge the
 * lesson set, recompute progress, advance the version, record the event key, and
 * bump the attempt count on scored events.
 *
 * Pure: no Firestore. The trigger reads/writes the enrollment transactionally
 * via `DbPort` and calls this to compute the next state.
 */

/** The enrollment fields this fold reads and advances. */
export interface EnrollmentProjection {
  progressPct: number;
  completed: boolean;
  score?: number;
  progressVersion: number;
  completedLessonIds: string[];
  attemptCount: number;
  lastEventKey?: string;
  lastActivityAt?: string;
}

export interface ApplyContext {
  /** Total lessons in the course, used to recompute `progressPct`. */
  totalLessons?: number;
}

export type ApplyOutcome = 'applied' | 'ignored';

export interface ApplyResult {
  outcome: ApplyOutcome;
  /** The next projection (identical reference-wise semantics: unchanged on ignore). */
  next: EnrollmentProjection;
}

/** A zeroed projection for an enrollment that has no events yet. */
export function emptyProjection(): EnrollmentProjection {
  return {
    progressPct: 0,
    completed: false,
    progressVersion: 0,
    completedLessonIds: [],
    attemptCount: 0,
  };
}

/**
 * Normalize a possibly-partial enrollment doc (older docs may predate the
 * additive fields) into a full projection with the contract defaults.
 */
export function toProjection(existing: Partial<EnrollmentProjection> | null): EnrollmentProjection {
  return {
    progressPct: existing?.progressPct ?? 0,
    completed: existing?.completed ?? false,
    ...(existing?.score !== undefined ? { score: existing.score } : {}),
    progressVersion: existing?.progressVersion ?? 0,
    completedLessonIds: existing?.completedLessonIds ?? [],
    attemptCount: existing?.attemptCount ?? 0,
    ...(existing?.lastEventKey !== undefined ? { lastEventKey: existing.lastEventKey } : {}),
    ...(existing?.lastActivityAt !== undefined ? { lastActivityAt: existing.lastActivityAt } : {}),
  };
}

function progressPctFor(completedCount: number, ctx: ApplyContext, fallback: number): number {
  if (ctx.totalLessons && ctx.totalLessons > 0) {
    return Math.min(100, Math.round((completedCount / ctx.totalLessons) * 100));
  }
  // Without a known total, never regress the existing pct.
  return fallback;
}

/**
 * Fold a single event onto the projection. Returns `{ outcome: 'ignored' }` with
 * the unchanged projection when the monotonic guard rejects the event, else
 * `{ outcome: 'applied' }` with the advanced projection.
 */
export function applyEventToEnrollment(
  existing: EnrollmentProjection,
  event: ProgressEvent,
  ctx: ApplyContext = {},
): ApplyResult {
  // Monotonic guard: already folded (replay) or stale reorder.
  if (event.clientSeq <= existing.progressVersion) {
    return { outcome: 'ignored', next: existing };
  }

  // Merge the completed-lesson set (dedup) for lesson-scoped events.
  let completedLessonIds = existing.completedLessonIds;
  if (event.kind === 'lesson_completed' && event.lessonId) {
    if (!completedLessonIds.includes(event.lessonId)) {
      completedLessonIds = [...completedLessonIds, event.lessonId];
    }
  }

  const courseCompleted = event.kind === 'course_completed';
  const completed = existing.completed || courseCompleted;

  const progressPct = courseCompleted
    ? 100
    : progressPctFor(completedLessonIds.length, ctx, existing.progressPct);

  // Scored attempts bump the counter and record the latest score (best-effort).
  const scored = event.kind === 'score_recorded' && event.score !== undefined;

  const next: EnrollmentProjection = {
    progressPct,
    completed,
    ...(scored
      ? { score: event.score }
      : existing.score !== undefined
        ? { score: existing.score }
        : {}),
    progressVersion: event.clientSeq,
    completedLessonIds,
    attemptCount: existing.attemptCount + (scored ? 1 : 0),
    lastEventKey: event.idempotencyKey,
    lastActivityAt: event.occurredAt,
  };

  return { outcome: 'applied', next };
}
