import { FakeGamificationDbPort } from './fakes';
import { onEnrollmentWrittenCore } from './on-enrollment-written.core';
import type { EnrollmentWriteEvent } from './on-enrollment-written.core';

const NOW = '2026-06-11T12:00:00.000Z';
const base = { tenantId: 'acme', courseId: 'c1', uid: 'learner-1' };

function enrollment(completedLessons: string[], extra: Record<string, unknown> = {}) {
  return {
    uid: 'learner-1',
    courseId: 'c1',
    tenantId: 'acme',
    progressPct: 50,
    completed: false,
    cmi: { completedLessons },
    createdAt: '2026-06-01T00:00:00.000Z',
    ...extra,
  };
}

function makeDb(): FakeGamificationDbPort {
  const db = new FakeGamificationDbPort();
  db.members.set('acme/learner-1', {
    uid: 'learner-1',
    tenantId: 'acme',
    role: 'learner',
    status: 'active',
    email: 'learner-1@acme.test',
    xp: 0,
    level: 1,
    streakDays: 0,
  });
  return db;
}

async function run(
  db: FakeGamificationDbPort,
  event: Omit<EnrollmentWriteEvent, keyof typeof base>,
) {
  return onEnrollmentWrittenCore({ db }, { ...base, ...event }, NOW);
}

describe('onEnrollmentWrittenCore', () => {
  it('awards +50 and writes one ledger entry for a newly completed lesson', async () => {
    const db = makeDb();
    const result = await run(db, { before: enrollment([]), after: enrollment(['l1']) });
    expect(result).toEqual({ action: 'awarded', xpDelta: 50, badges: [] });
    expect(db.xpEvents.get('acme/learner-1/lesson_c1_l1')).toEqual({
      id: 'lesson_c1_l1',
      uid: 'learner-1',
      tenantId: 'acme',
      amount: 50,
      reason: 'lesson_completed',
      sourceRef: 'courses/c1/lessons/l1',
      at: NOW,
    });
    expect(db.members.get('acme/learner-1')).toMatchObject({
      xp: 50,
      level: 1,
      streakDays: 1,
      lastActiveAt: NOW,
    });
  });

  it('handles an initial write (no before doc) as all-new lessons', async () => {
    const db = makeDb();
    const result = await run(db, { before: null, after: enrollment(['l1', 'l2']) });
    expect(result.xpDelta).toBe(100);
    expect(db.addXpEventCalls).toHaveLength(2);
  });

  it('only awards the diffed lessons, not ones completed earlier', async () => {
    const db = makeDb();
    const result = await run(db, { before: enrollment(['l1']), after: enrollment(['l1', 'l2']) });
    expect(result.xpDelta).toBe(50);
    expect(db.addXpEventCalls.map((c) => c.eventId)).toEqual(['lesson_c1_l2']);
  });

  it('awards course completion (+200) plus the rounded score bonus and first-steps', async () => {
    const db = makeDb();
    const result = await run(db, {
      before: enrollment(['l1']),
      after: enrollment(['l1', 'l2'], { completed: true, score: 96.4, progressPct: 100 }),
    });
    // l2 (+50) + course (+200) + score bonus (+96).
    expect(result.xpDelta).toBe(346);
    expect(result.badges).toEqual(expect.arrayContaining(['first-steps', 'sharpshooter']));
    expect(db.xpEvents.get('acme/learner-1/course_c1')).toMatchObject({
      amount: 200,
      reason: 'course_completed',
      sourceRef: 'courses/c1',
    });
    expect(db.xpEvents.get('acme/learner-1/score_c1')).toMatchObject({
      amount: 96,
      reason: 'score_bonus',
    });
    // 346 XP crosses the level-3 threshold (300).
    expect(db.members.get('acme/learner-1')).toMatchObject({
      xp: 346,
      level: 3,
      completedCourses: 1,
    });
    expect(db.awards.get('acme/learner-1/first-steps')).toMatchObject({
      badgeId: 'first-steps',
      name: 'First Steps',
      earnedAt: NOW,
    });
  });

  it('omits the score bonus when the completing write carries no score', async () => {
    const db = makeDb();
    const result = await run(db, {
      before: enrollment(['l1']),
      after: enrollment(['l1'], { completed: true }),
    });
    expect(result.xpDelta).toBe(200);
    expect(db.xpEvents.has('acme/learner-1/score_c1')).toBe(false);
  });

  it('does not re-award the course completion when completed stays true', async () => {
    const db = makeDb();
    const result = await run(db, {
      before: enrollment(['l1'], { completed: true }),
      after: enrollment(['l1'], { completed: true, score: 100 }),
    });
    expect(result.action).toBe('noop');
    expect(db.addXpEventCalls).toHaveLength(0);
  });

  it('is idempotent when the trigger re-fires with the identical before/after pair', async () => {
    const db = makeDb();
    const event = {
      before: enrollment([]),
      after: enrollment(['l1'], { completed: true, score: 90 }),
    };
    const first = await run(db, event);
    expect(first.action).toBe('awarded');
    const xpAfterFirst = db.members.get('acme/learner-1')?.['xp'];

    // Duplicate delivery: the deterministic ledger ids already exist.
    const second = await run(db, event);
    expect(second.action).toBe('noop');
    expect(db.members.get('acme/learner-1')?.['xp']).toBe(xpAfterFirst);
    expect(db.setAwardCalls.filter((c) => c.badgeId === 'first-steps')).toHaveLength(1);
  });

  it('never double-awards a badge even when its crossing replays', async () => {
    const db = makeDb();
    await run(db, { before: enrollment([]), after: enrollment([], { completed: true }) });
    expect(db.setAwardCalls.map((c) => c.badgeId)).toEqual(['first-steps']);
    // A second course completes while the member already holds first-steps…
    db.members.set('acme/learner-1', {
      ...(db.members.get('acme/learner-1') ?? {}),
      completedCourses: 0, // simulate a stale counter replaying the crossing
    });
    await onEnrollmentWrittenCore(
      { db },
      {
        ...base,
        courseId: 'c2',
        before: enrollment([]),
        after: enrollment([], { completed: true }),
      },
      NOW,
    );
    // …the engine reports the crossing again, but persistence skips it.
    expect(db.setAwardCalls.map((c) => c.badgeId)).toEqual(['first-steps']);
  });

  it('is a noop when nothing XP-worthy changed', async () => {
    const db = makeDb();
    const result = await run(db, {
      before: enrollment(['l1']),
      after: enrollment(['l1'], { progressPct: 60 }),
    });
    expect(result.action).toBe('noop');
    expect(db.addXpEventCalls).toHaveLength(0);
    expect(db.setAwardCalls).toHaveLength(0);
  });

  it('is a noop when the enrollment doc is deleted', async () => {
    const db = makeDb();
    const result = await run(db, { before: enrollment(['l1']), after: null });
    expect(result.action).toBe('noop');
  });

  it('skips (writes nothing) when the member doc does not exist', async () => {
    const db = new FakeGamificationDbPort();
    const result = await run(db, { before: enrollment([]), after: enrollment(['l1']) });
    expect(result.action).toBe('skipped');
    expect(db.addXpEventCalls).toHaveLength(0);
    expect(db.members.size).toBe(0);
  });

  it('increments the streak across consecutive UTC days', async () => {
    const db = makeDb();
    db.members.set('acme/learner-1', {
      ...(db.members.get('acme/learner-1') ?? {}),
      streakDays: 6,
      lastActiveAt: '2026-06-10T08:00:00.000Z',
    });
    const result = await run(db, { before: enrollment([]), after: enrollment(['l1']) });
    expect(result.badges).toContain('on-fire');
    expect(db.members.get('acme/learner-1')).toMatchObject({ streakDays: 7 });
  });
});
