import { inject, Injectable } from '@angular/core';
import { runTransaction, setDoc } from 'firebase/firestore';
import { enrollmentDoc, enrollmentEventDoc, FIRESTORE } from '@forge/data-access';
import type { Enrollment, ProgressEvent, ProgressEventKind } from '@forge/shared';

/**
 * Options carried by an idempotent progress write. When omitted they are
 * default-generated (a fresh idempotency key + a now-based `clientSeq`) so the
 * existing callers and specs keep compiling — but a real client (the offline
 * sync queue, Lane C) supplies a stable key + monotonic per-device `clientSeq`
 * so that replays collapse and out-of-order events do not regress progress.
 */
export interface ProgressWriteOptions {
  /** Client-generated; becomes the event document id. */
  idempotencyKey?: string;
  /** Stable per-device id; reused across this device's events. */
  deviceId?: string;
  /** Monotonic per-device sequence → ordering + projection guard. */
  clientSeq?: number;
}

/**
 * Writes the learner's OWN progress as they move through a course.
 *
 * The write is split into two idempotent halves (see HARDENING_CONTRACTS §core
 * model):
 *
 *   1. Append the {@link ProgressEvent} at its `idempotencyKey` doc id. A replay
 *      re-writes the same id ⇒ collapses (no duplication).
 *   2. Apply the event to the enrollment projection inside a `runTransaction`,
 *      guarded by a monotonic `progressVersion`: an event whose `clientSeq` is
 *      `<= progressVersion` is treated as a stale no-op and never regresses the
 *      already-applied state.
 *
 * Note: this only advances the enrollment (allowed by the security rules). It
 * never writes the member doc — live XP/level/streak updates are a Phase-4
 * Cloud Function; the demo surfaces XP as a client-side projection only.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly db = inject(FIRESTORE);

  /**
   * Records that a lesson has been completed and derives `progressPct` from the
   * union of all lessons completed so far. Upserts the enrollment (enrolling
   * implicitly if needed) so the call is safe even before an explicit enroll().
   *
   * Note: this NEVER sets `completed = true`, even at 100% — reaching every
   * lesson only fills the progress bar. The `completed` flag is reserved for
   * {@link completeCourse} so the learner still has to click "Complete course"
   * (and see the celebration). This keeps lesson progress and course completion
   * as distinct, intentional steps.
   *
   * `completedLessonIds` is the client's view of the lessons it has touched; the
   * server-derived projection takes the union with whatever the enrollment
   * already recorded, so it never loses a lesson seen by a concurrent writer.
   */
  async setLessonProgress(
    tenantId: string,
    courseId: string,
    uid: string,
    completedLessonIds: string[],
    totalLessons: number,
    options: ProgressWriteOptions = {},
  ): Promise<Enrollment> {
    return this.apply(tenantId, courseId, uid, totalLessons, 'lesson_completed', completedLessonIds, false, undefined, options);
  }

  /** Marks the course complete: `completed = true`, `progressPct = 100`. */
  async completeCourse(
    tenantId: string,
    courseId: string,
    uid: string,
    score?: number,
    options: ProgressWriteOptions = {},
  ): Promise<Enrollment> {
    return this.apply(tenantId, courseId, uid, 0, 'course_completed', [], true, score, options);
  }

  /**
   * Appends the event (idempotent upsert) then applies it to the enrollment
   * projection under the monotonic `progressVersion` guard. Returns the
   * resulting enrollment (the freshly applied one, or the existing one when the
   * event is a stale replay).
   */
  private async apply(
    tenantId: string,
    courseId: string,
    uid: string,
    totalLessons: number,
    kind: ProgressEventKind,
    completedLessonIds: string[],
    completing: boolean,
    score: number | undefined,
    options: ProgressWriteOptions,
  ): Promise<Enrollment> {
    const now = new Date().toISOString();
    const idempotencyKey = options.idempotencyKey ?? defaultIdempotencyKey();
    const deviceId = options.deviceId ?? 'unknown-device';
    const clientSeq = options.clientSeq ?? defaultClientSeq();
    const lessonId = completedLessonIds[completedLessonIds.length - 1];

    const event: ProgressEvent = {
      idempotencyKey,
      uid,
      tenantId,
      courseId,
      kind,
      ...(lessonId === undefined ? {} : { lessonId }),
      ...(score === undefined ? {} : { score }),
      clientSeq,
      occurredAt: now,
      deviceId,
      createdAt: now,
    };

    // 1. Append the event at its idempotency-key doc id. A replay re-writes the
    //    same id ⇒ collapses.
    await setDoc(enrollmentEventDoc(this.db, tenantId, courseId, uid, idempotencyKey), event);

    // 2. Apply the event to the enrollment projection under the monotonic guard.
    return runTransaction(this.db, async (tx) => {
      const ref = enrollmentDoc(this.db, tenantId, courseId, uid);
      const snapshot = await tx.get(ref);
      const existing = snapshot.exists() ? snapshot.data() : undefined;

      const base: Enrollment = existing ?? {
        uid,
        courseId,
        tenantId,
        progressPct: 0,
        completed: false,
        progressVersion: 0,
        completedLessonIds: [],
        attemptCount: 0,
        createdAt: now,
        createdBy: uid,
      };

      // Stale / replayed event: never regress already-applied state.
      const appliedVersion = base.progressVersion ?? 0;
      if (existing && clientSeq <= appliedVersion) {
        return base;
      }

      // Union the client's completed lessons with the projection's, then dedupe.
      const lessons = new Set<string>(base.completedLessonIds ?? []);
      for (const id of completedLessonIds) {
        lessons.add(id);
      }
      const completedList = [...lessons];

      const next: Enrollment = {
        ...base,
        uid,
        courseId,
        tenantId,
        completedLessonIds: completedList,
        progressVersion: clientSeq,
        lastEventKey: idempotencyKey,
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: uid,
      };

      if (completing) {
        next.completed = true;
        next.progressPct = 100;
        next.attemptCount = (base.attemptCount ?? 0) + 1;
        if (score !== undefined) {
          next.score = score;
        }
      } else {
        next.progressPct =
          totalLessons > 0 ? Math.min(100, Math.round((completedList.length / totalLessons) * 100)) : 0;
      }

      tx.set(ref, next);
      return next;
    });
  }
}

/** A fresh, path-safe idempotency key (>= 8 chars) when a caller omits one. */
function defaultIdempotencyKey(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `evt-${uuid}`;
}

/**
 * A best-effort monotonic-ish sequence for callers that do not supply one.
 * Real per-device monotonicity is owned by the offline queue (Lane C); this
 * now-based value keeps single-writer callers (and the existing specs)
 * advancing forward.
 */
function defaultClientSeq(): number {
  return Date.now();
}
