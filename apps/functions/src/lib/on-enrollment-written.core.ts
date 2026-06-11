import { z } from 'zod';
import type { PlatformBadgeId } from '@forge/shared';
import { persistEarnedBadges } from './badge-credential';
import type { GamificationDbPort } from './ports';
import { applyGamificationEvent, memberStateOf, stateAfter } from './xp-engine.core';
import type { GamificationEvent, MemberGamificationState } from './xp-engine.core';

/**
 * Pure core for the enrollments onDocumentWritten trigger
 * (tenants/{tenantId}/courses/{courseId}/enrollments/{uid} — the path the
 * learner app actually writes, see libs/lms-core enrollment.service.ts; lesson
 * state lives in the enrollment's `cmi.completedLessons` array).
 *
 * Detects newly completed lessons (before/after diff of cmi.completedLessons)
 * and the course-completion transition (completed false -> true, carrying the
 * enrollment's score when present), runs the XP engine over each occurrence,
 * and persists the member counters, XP ledger entries and badge awards.
 *
 * Idempotence story (triggers can re-fire):
 *  1. Before/after diff — ordinary progress writes re-list every completed
 *     lesson, so already-processed lessons never diff as new, and `completed`
 *     only transitions false -> true once per enrollment.
 *  2. Deterministic ledger ids (lesson_{courseId}_{lessonId},
 *     course_{courseId}, score_{courseId}) — each occurrence is pre-checked
 *     against the ledger and skipped when its entry already exists, so even a
 *     duplicate delivery of the SAME before/after pair awards nothing twice.
 *  3. Badge awards are keyed by badgeId and existence-checked before writing
 *     (see persistEarnedBadges) — badges are exactly-once.
 */

const enrollmentSnapshot = z.object({
  completed: z.boolean().optional(),
  score: z.number().optional(),
  cmi: z.record(z.string(), z.unknown()).optional(),
});

function snapshotOf(value: unknown): z.infer<typeof enrollmentSnapshot> | null {
  if (value === null || value === undefined) return null;
  const result = enrollmentSnapshot.safeParse(value);
  return result.success ? result.data : null;
}

/** Reads `cmi.completedLessons` defensively: non-string entries are dropped. */
function completedLessonsOf(snapshot: z.infer<typeof enrollmentSnapshot> | null): string[] {
  const raw = snapshot?.cmi?.['completedLessons'];
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

/** Firestore doc ids may not contain '/'. */
function ledgerId(raw: string): string {
  return raw.replace(/\//g, '_');
}

export interface EnrollmentWriteEvent {
  tenantId: string;
  courseId: string;
  uid: string;
  before: unknown;
  after: unknown;
}

export interface EnrollmentGamificationResult {
  action: 'noop' | 'skipped' | 'awarded';
  xpDelta: number;
  badges: PlatformBadgeId[];
}

/** One XP-worthy occurrence plus the deterministic ledger ids of its entries. */
interface Occurrence {
  /** Ledger doc ids, in the order the engine emits the entries. */
  ledgerIds: string[];
  event: GamificationEvent;
}

export async function onEnrollmentWrittenCore(
  deps: { db: GamificationDbPort },
  event: EnrollmentWriteEvent,
  now: string = new Date().toISOString(),
): Promise<EnrollmentGamificationResult> {
  const none: EnrollmentGamificationResult = { action: 'noop', xpDelta: 0, badges: [] };
  const after = snapshotOf(event.after);
  if (!after) return none; // Deleted or malformed: nothing to award.
  const before = snapshotOf(event.before);

  const beforeLessons = new Set(completedLessonsOf(before));
  const newLessons = completedLessonsOf(after).filter((id) => !beforeLessons.has(id));
  const courseCompleted = after.completed === true && before?.completed !== true;
  if (newLessons.length === 0 && !courseCompleted) return none;

  const { tenantId, courseId, uid } = event;
  const member = await deps.db.getMember(tenantId, uid);
  if (!member) {
    // No member doc: enrollments require membership; never create a partial one.
    return { action: 'skipped', xpDelta: 0, badges: [] };
  }

  const occurrences: Occurrence[] = newLessons.map((lessonId) => ({
    ledgerIds: [ledgerId(`lesson_${courseId}_${lessonId}`)],
    event: { kind: 'lesson', sourceRef: `courses/${courseId}/lessons/${lessonId}` },
  }));
  if (courseCompleted) {
    const ledgerIds = [ledgerId(`course_${courseId}`)];
    if (after.score !== undefined) ledgerIds.push(ledgerId(`score_${courseId}`));
    occurrences.push({
      ledgerIds,
      event: {
        kind: 'course',
        ...(after.score !== undefined ? { score: after.score } : {}),
        sourceRef: `courses/${courseId}`,
      },
    });
  }

  let state: MemberGamificationState = memberStateOf(member);
  let xpDelta = 0;
  const badges: PlatformBadgeId[] = [];
  let awardedAnything = false;

  for (const occurrence of occurrences) {
    // Ledger pre-check: a duplicate trigger delivery already wrote this entry.
    if (await deps.db.getXpEvent(tenantId, uid, occurrence.ledgerIds[0])) continue;

    const result = applyGamificationEvent(state, occurrence.event, now);
    for (let i = 0; i < result.xpEvents.length; i++) {
      const draft = result.xpEvents[i];
      const eventId = occurrence.ledgerIds[i];
      await deps.db.addXpEvent(tenantId, uid, eventId, { id: eventId, uid, tenantId, ...draft });
    }
    xpDelta += result.xpDelta;
    badges.push(...result.badgesEarned);
    state = stateAfter(result, now);
    awardedAnything = true;
  }

  if (!awardedAnything) return none;

  await deps.db.setMember(tenantId, uid, {
    xp: state.xp,
    level: state.level,
    streakDays: state.streakDays,
    lastActiveAt: now,
    // Server-side bookkeeping counter (not in the client member schema).
    completedCourses: state.completedCourses,
  });

  const awarded = await persistEarnedBadges(deps.db, tenantId, uid, badges, now);
  return { action: 'awarded', xpDelta, badges: awarded };
}
