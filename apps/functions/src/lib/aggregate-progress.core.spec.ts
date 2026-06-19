import type { ProgressEvent } from '@forge/shared';
import {
  applyEventToEnrollment,
  emptyProjection,
  toProjection,
  type EnrollmentProjection,
} from './aggregate-progress.core';

function makeEvent(overrides: Partial<ProgressEvent> = {}): ProgressEvent {
  return {
    idempotencyKey: 'evt-00000001',
    uid: 'u1',
    tenantId: 'acme',
    courseId: 'course-1',
    kind: 'lesson_completed',
    lessonId: 'lesson-1',
    clientSeq: 1,
    occurredAt: '2026-06-19T10:00:00.000Z',
    deviceId: 'device-1',
    createdAt: '2026-06-19T10:00:01.000Z',
    ...overrides,
  };
}

describe('toProjection', () => {
  it('fills contract defaults for a partial/legacy enrollment', () => {
    expect(toProjection(null)).toEqual(emptyProjection());
    expect(toProjection({ progressPct: 50 })).toMatchObject({
      progressPct: 50,
      progressVersion: 0,
      completedLessonIds: [],
      attemptCount: 0,
      completed: false,
    });
  });
});

describe('applyEventToEnrollment', () => {
  it('applies a normal lesson_completed event', () => {
    const { outcome, next } = applyEventToEnrollment(
      emptyProjection(),
      makeEvent({ clientSeq: 1, lessonId: 'lesson-1' }),
      { totalLessons: 4 },
    );
    expect(outcome).toBe('applied');
    expect(next.completedLessonIds).toEqual(['lesson-1']);
    expect(next.progressVersion).toBe(1);
    expect(next.progressPct).toBe(25); // 1/4
    expect(next.lastEventKey).toBe('evt-00000001');
    expect(next.lastActivityAt).toBe('2026-06-19T10:00:00.000Z');
    expect(next.attemptCount).toBe(0);
  });

  it('is a no-op on exact replay (clientSeq == progressVersion)', () => {
    const existing: EnrollmentProjection = {
      ...emptyProjection(),
      progressVersion: 5,
      completedLessonIds: ['lesson-1'],
      progressPct: 25,
    };
    const { outcome, next } = applyEventToEnrollment(
      existing,
      makeEvent({ clientSeq: 5, lessonId: 'lesson-2' }),
    );
    expect(outcome).toBe('ignored');
    expect(next).toBe(existing); // unchanged reference
  });

  it('ignores an out-of-order (stale) event (clientSeq < progressVersion)', () => {
    const existing: EnrollmentProjection = {
      ...emptyProjection(),
      progressVersion: 5,
    };
    const { outcome, next } = applyEventToEnrollment(existing, makeEvent({ clientSeq: 3 }));
    expect(outcome).toBe('ignored');
    expect(next.progressVersion).toBe(5);
  });

  it('dedups a lesson already in the completed set', () => {
    const existing: EnrollmentProjection = {
      ...emptyProjection(),
      progressVersion: 1,
      completedLessonIds: ['lesson-1'],
    };
    const { next } = applyEventToEnrollment(
      existing,
      makeEvent({ clientSeq: 2, lessonId: 'lesson-1' }),
    );
    expect(next.completedLessonIds).toEqual(['lesson-1']);
    expect(next.progressVersion).toBe(2);
  });

  it('course_completed sets completed and pct=100', () => {
    const { outcome, next } = applyEventToEnrollment(
      emptyProjection(),
      makeEvent({ kind: 'course_completed', lessonId: undefined, clientSeq: 9 }),
    );
    expect(outcome).toBe('applied');
    expect(next.completed).toBe(true);
    expect(next.progressPct).toBe(100);
    expect(next.progressVersion).toBe(9);
  });

  it('score_recorded bumps attemptCount and records the score', () => {
    const { next } = applyEventToEnrollment(
      emptyProjection(),
      makeEvent({ kind: 'score_recorded', lessonId: undefined, score: 88, clientSeq: 2 }),
    );
    expect(next.attemptCount).toBe(1);
    expect(next.score).toBe(88);
    expect(next.progressVersion).toBe(2);
  });

  it('does not regress progressPct when totalLessons is unknown', () => {
    const existing: EnrollmentProjection = {
      ...emptyProjection(),
      progressPct: 75,
      progressVersion: 3,
    };
    const { next } = applyEventToEnrollment(
      existing,
      makeEvent({ clientSeq: 4, lessonId: 'lesson-9' }),
    );
    expect(next.progressPct).toBe(75); // unchanged, no total provided
  });

  it('replaying a sequence converges regardless of order', () => {
    const e1 = makeEvent({ idempotencyKey: 'a', clientSeq: 1, lessonId: 'l1' });
    const e2 = makeEvent({ idempotencyKey: 'b', clientSeq: 2, lessonId: 'l2' });
    const ctx = { totalLessons: 2 };

    // in order
    let p = emptyProjection();
    p = applyEventToEnrollment(p, e1, ctx).next;
    p = applyEventToEnrollment(p, e2, ctx).next;

    // out of order then replay
    let q = emptyProjection();
    q = applyEventToEnrollment(q, e2, ctx).next;
    q = applyEventToEnrollment(q, e1, ctx).next; // stale → ignored
    q = applyEventToEnrollment(q, e2, ctx).next; // replay → ignored

    expect(p.progressVersion).toBe(2);
    expect(q.progressVersion).toBe(2);
    expect(p.progressPct).toBe(100);
    expect(q.progressPct).toBe(50); // only l2 folded; l1 lost to reorder (documents the guard)
  });
});
