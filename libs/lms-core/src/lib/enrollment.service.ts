import { Injectable } from '@angular/core';
import { getDoc, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { enrollmentDoc } from '@forge/data-access';
import type { CourseDraft, Enrollment } from '@forge/shared';

/**
 * Learner enrollment/progress persistence for Phase 2.
 *
 * Phase 2 convention: authored content lives at
 * /tenants/{t}/courseDrafts/{courseId}, but enrollment docs are written under
 * the *courses* path — /tenants/{t}/courses/{courseId}/enrollments/{uid} —
 * keyed by the courseDraft's id. That path is already open for enrollee
 * self-writes in firestore.rules, so learners can record progress without any
 * rules change while the courseDrafts tree stays authoring-only for writes.
 *
 * Per-lesson completion state is stored inside the enrollment's `cmi` map as
 * `{ completedLessons: string[] }` (lesson ids), so no schema change is
 * needed; progressPct/completed/score are derived from it on every write.
 */

/** Per-lesson progress snapshot derived from completed lesson ids. */
export interface ProgressSnapshot {
  /** 0..100, rounded to the nearest integer. */
  progressPct: number;
  /** True exactly when every lesson of the course is complete. */
  completed: boolean;
}

// ---- Pure helpers (unit-tested without Firestore) ---------------------------

/** Reads `cmi.completedLessons` defensively: non-string entries are dropped. */
export function completedLessonsOf(enrollment: Enrollment | null | undefined): string[] {
  const raw = enrollment?.cmi?.['completedLessons'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

/** Adds `lessonId` to the set, idempotently and order-preserving. */
export function withCompletedLesson(completedLessonIds: string[], lessonId: string): string[] {
  return completedLessonIds.includes(lessonId)
    ? [...completedLessonIds]
    : [...completedLessonIds, lessonId];
}

/**
 * Progress = completed lessons / total lessons (rounded to a whole percent);
 * completed at 100. Ids not present in the course (e.g. lessons deleted after
 * completion) are ignored, and an empty course reports 0 / not completed.
 */
export function progressFor(course: CourseDraft, completedLessonIds: string[]): ProgressSnapshot {
  const total = course.lessons.length;
  if (total === 0) return { progressPct: 0, completed: false };
  const lessonIds = new Set(course.lessons.map((lesson) => lesson.id));
  const done = new Set(completedLessonIds.filter((id) => lessonIds.has(id))).size;
  const progressPct = Math.round((done / total) * 100);
  return { progressPct, completed: done === total };
}

/**
 * Average knowledge-check correctness as 0..100 (rounded), or undefined when
 * no results were collected — callers omit `score` in that case.
 */
export function scoreFor(knowledgeCheckResults: readonly boolean[]): number | undefined {
  if (knowledgeCheckResults.length === 0) return undefined;
  const correct = knowledgeCheckResults.filter(Boolean).length;
  return Math.round((correct / knowledgeCheckResults.length) * 100);
}

/** Inputs for {@link ForgeEnrollment.markLessonComplete}. */
export interface MarkLessonCompleteArgs {
  tenantId: string;
  uid: string;
  /** The published course draft being played (its id keys the enrollment). */
  course: CourseDraft;
  lessonId: string;
  /**
   * Current enrollment if the caller already holds it (saves a read); pass
   * undefined to have it fetched, or null when known to not exist yet.
   */
  existing?: Enrollment | null;
  /** Knowledge-check correctness for the lesson, when collected. */
  knowledgeCheckResults?: readonly boolean[];
}

/**
 * Builds the next enrollment document after completing a lesson. Pure: no
 * Firestore types, fully covered by unit tests. Idempotent for already
 * completed lessons (besides the lastActivityAt/updatedAt touch).
 */
export function nextEnrollment(
  args: Omit<MarkLessonCompleteArgs, 'existing'> & { existing: Enrollment | null },
  now: string = new Date().toISOString(),
): Enrollment {
  const { tenantId, uid, course, lessonId, existing, knowledgeCheckResults } = args;
  const completedLessons = withCompletedLesson(completedLessonsOf(existing), lessonId);
  const { progressPct, completed } = progressFor(course, completedLessons);
  const score = scoreFor(knowledgeCheckResults ?? []) ?? existing?.score;
  return {
    uid,
    courseId: course.id,
    tenantId,
    progressPct,
    completed,
    // zod strips undefined-valued optionals, so `score: undefined` stays omitted.
    ...(score !== undefined ? { score } : {}),
    lastActivityAt: now,
    cmi: { ...(existing?.cmi ?? {}), completedLessons },
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? uid,
    updatedAt: now,
    updatedBy: uid,
  };
}

// ---- Firestore-facing service -----------------------------------------------

@Injectable({ providedIn: 'root' })
export class ForgeEnrollment {
  /** The caller's enrollment for a course, or undefined when never enrolled. */
  async get(
    db: Firestore,
    tenantId: string,
    courseId: string,
    uid: string,
  ): Promise<Enrollment | undefined> {
    const snapshot = await getDoc(enrollmentDoc(db, tenantId, courseId, uid));
    return snapshot.exists() ? snapshot.data() : undefined;
  }

  /**
   * Insert-or-replace the enrollment doc at
   * /tenants/{t}/courses/{courseId}/enrollments/{uid} (full doc, validated by
   * the zod converter on write).
   */
  async upsert(db: Firestore, enrollment: Enrollment): Promise<void> {
    await setDoc(
      enrollmentDoc(db, enrollment.tenantId, enrollment.courseId, enrollment.uid),
      enrollment,
    );
  }

  /**
   * Records a lesson completion: derives progressPct / completed / score /
   * lastActivityAt and upserts the enrollment. Resolves the persisted doc so
   * callers can update local state from the same value they wrote.
   */
  async markLessonComplete(db: Firestore, args: MarkLessonCompleteArgs): Promise<Enrollment> {
    const existing =
      args.existing !== undefined
        ? args.existing
        : ((await this.get(db, args.tenantId, args.course.id, args.uid)) ?? null);
    const next = nextEnrollment({ ...args, existing });
    await this.upsert(db, next);
    return next;
  }
}
