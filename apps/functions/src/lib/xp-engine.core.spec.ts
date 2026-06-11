import {
  applyGamificationEvent,
  gameXp,
  memberStateOf,
  nextStreakDays,
  stateAfter,
  XP_HAZARD_HUNTER_CAP,
  XP_PER_COURSE,
  XP_PER_LESSON,
  XP_PERIL_LOSS,
  XP_PERIL_WIN,
} from './xp-engine.core';
import type { MemberGamificationState } from './xp-engine.core';

const NOW = '2026-06-11T12:00:00.000Z';
const YESTERDAY = '2026-06-10T23:59:59.000Z';
const LAST_WEEK = '2026-06-04T12:00:00.000Z';

const fresh: MemberGamificationState = {
  xp: 0,
  level: 1,
  streakDays: 0,
  completedCourses: 0,
  gamesPlayed: 0,
};

describe('applyGamificationEvent — XP amounts', () => {
  it('awards +50 for a completed lesson', () => {
    const result = applyGamificationEvent(
      fresh,
      { kind: 'lesson', sourceRef: 'courses/c1/lessons/l1' },
      NOW,
    );
    expect(result.xpDelta).toBe(XP_PER_LESSON);
    expect(result.newXp).toBe(50);
    expect(result.xpEvents).toEqual([
      { amount: 50, reason: 'lesson_completed', sourceRef: 'courses/c1/lessons/l1', at: NOW },
    ]);
  });

  it('awards +200 for a completed course without a score', () => {
    const result = applyGamificationEvent(fresh, { kind: 'course', sourceRef: 'courses/c1' }, NOW);
    expect(result.xpDelta).toBe(XP_PER_COURSE);
    expect(result.xpEvents.map((e) => e.reason)).toEqual(['course_completed']);
  });

  it('adds a rounded score bonus when the completing write carries a score', () => {
    const result = applyGamificationEvent(
      fresh,
      { kind: 'course', score: 87.5, sourceRef: 'courses/c1' },
      NOW,
    );
    expect(result.xpDelta).toBe(200 + 88);
    expect(result.xpEvents.map((e) => [e.reason, e.amount])).toEqual([
      ['course_completed', 200],
      ['score_bonus', 88],
    ]);
  });

  it('treats a score of 0 as a present (zero) bonus, not as absent', () => {
    const result = applyGamificationEvent(
      fresh,
      { kind: 'course', score: 0, sourceRef: 'courses/c1' },
      NOW,
    );
    expect(result.xpEvents.map((e) => e.reason)).toEqual(['course_completed', 'score_bonus']);
    expect(result.xpDelta).toBe(200);
  });

  it('awards round(score/10) for hazard-hunter, capped at 150', () => {
    expect(gameXp('hazard-hunter', 123, undefined)).toBe(12);
    expect(gameXp('hazard-hunter', 125, undefined)).toBe(13); // rounds, not floors
    expect(gameXp('hazard-hunter', 1499, undefined)).toBe(XP_HAZARD_HUNTER_CAP);
    expect(gameXp('hazard-hunter', 999999, undefined)).toBe(XP_HAZARD_HUNTER_CAP);
  });

  it('awards peril wins +150 and losses +40', () => {
    expect(gameXp('peril', 500, true)).toBe(XP_PERIL_WIN);
    expect(gameXp('peril', 500, false)).toBe(XP_PERIL_LOSS);
    expect(gameXp('peril', 500, undefined)).toBe(XP_PERIL_LOSS);
  });
});

describe('applyGamificationEvent — level curve crossings', () => {
  it('levels up exactly when the cumulative threshold is reached', () => {
    // 50 XP -> still L1; second lesson reaches 100 -> L2.
    const first = applyGamificationEvent(fresh, { kind: 'lesson', sourceRef: 's' }, NOW);
    expect(first.newLevel).toBe(1);
    const second = applyGamificationEvent(
      stateAfter(first, NOW),
      { kind: 'lesson', sourceRef: 's2' },
      NOW,
    );
    expect(second.newXp).toBe(100);
    expect(second.newLevel).toBe(2);
  });

  it('can cross multiple thresholds in one event', () => {
    // 250 + 200 + 95 = 545 -> still L3 (600 needed for L4)…
    const midway = applyGamificationEvent(
      { ...fresh, xp: 250 },
      { kind: 'course', score: 95, sourceRef: 'courses/c1' },
      NOW,
    );
    expect(midway.newXp).toBe(545);
    expect(midway.newLevel).toBe(3);
    // …while 350 + 295 = 645 crosses into L4.
    const crossed = applyGamificationEvent(
      { ...fresh, xp: 350 },
      { kind: 'course', score: 95, sourceRef: 'courses/c1' },
      NOW,
    );
    expect(crossed.newXp).toBe(645);
    expect(crossed.newLevel).toBe(4);
  });
});

describe('streaks (UTC-date diff vs lastActiveAt)', () => {
  it('starts a streak at 1 when the member was never active', () => {
    expect(nextStreakDays(0, undefined, NOW)).toBe(1);
  });

  it('leaves the streak unchanged on a same-UTC-day event', () => {
    expect(nextStreakDays(3, '2026-06-11T00:00:01.000Z', NOW)).toBe(3);
    expect(nextStreakDays(3, '2026-06-11T23:59:59.000Z', NOW)).toBe(3);
  });

  it('increments the streak when last active exactly the previous UTC day', () => {
    expect(nextStreakDays(3, YESTERDAY, NOW)).toBe(4);
    expect(nextStreakDays(3, '2026-06-10T00:00:00.000Z', NOW)).toBe(4);
  });

  it('resets to 1 after a gap of two or more days (or a future lastActiveAt)', () => {
    expect(nextStreakDays(9, LAST_WEEK, NOW)).toBe(1);
    expect(nextStreakDays(9, '2026-06-09T23:59:59.000Z', NOW)).toBe(1);
    expect(nextStreakDays(9, '2026-06-13T00:00:00.000Z', NOW)).toBe(1);
  });

  it('resets to 1 on an unparseable lastActiveAt', () => {
    expect(nextStreakDays(5, 'not-a-date', NOW)).toBe(1);
  });

  it('updates the streak on every XP-awarding event kind', () => {
    const member = { ...fresh, streakDays: 2, lastActiveAt: YESTERDAY };
    expect(
      applyGamificationEvent(member, { kind: 'lesson', sourceRef: 's' }, NOW).newStreakDays,
    ).toBe(3);
    expect(
      applyGamificationEvent(
        member,
        { kind: 'game', game: 'peril', score: 0, won: false, sourceRef: 's' },
        NOW,
      ).newStreakDays,
    ).toBe(3);
  });
});

describe('badges', () => {
  it('awards first-steps on the first completed course only', () => {
    const first = applyGamificationEvent(fresh, { kind: 'course', sourceRef: 'courses/c1' }, NOW);
    expect(first.badgesEarned).toContain('first-steps');
    expect(first.completedCourses).toBe(1);
    const second = applyGamificationEvent(
      stateAfter(first, NOW),
      { kind: 'course', sourceRef: 'courses/c2' },
      NOW,
    );
    expect(second.badgesEarned).not.toContain('first-steps');
  });

  it('awards course-crusher when the fifth course completes, and never again', () => {
    const fourth = applyGamificationEvent(
      { ...fresh, completedCourses: 3 },
      { kind: 'course', sourceRef: 'courses/c4' },
      NOW,
    );
    expect(fourth.badgesEarned).not.toContain('course-crusher');
    const fifth = applyGamificationEvent(
      { ...fresh, completedCourses: 4 },
      { kind: 'course', sourceRef: 'courses/c5' },
      NOW,
    );
    expect(fifth.badgesEarned).toContain('course-crusher');
    const sixth = applyGamificationEvent(
      { ...fresh, completedCourses: 5 },
      { kind: 'course', sourceRef: 'courses/c6' },
      NOW,
    );
    expect(sixth.badgesEarned).not.toContain('course-crusher');
  });

  it('awards sharpshooter for a course completed with score >= 95', () => {
    const sharp = applyGamificationEvent(fresh, { kind: 'course', score: 95, sourceRef: 'c' }, NOW);
    expect(sharp.badgesEarned).toContain('sharpshooter');
    const close = applyGamificationEvent(
      fresh,
      { kind: 'course', score: 94.4, sourceRef: 'c' },
      NOW,
    );
    expect(close.badgesEarned).not.toContain('sharpshooter');
  });

  it('awards on-fire exactly when the streak crosses 7 days', () => {
    const crossing = applyGamificationEvent(
      { ...fresh, streakDays: 6, lastActiveAt: YESTERDAY },
      { kind: 'lesson', sourceRef: 's' },
      NOW,
    );
    expect(crossing.newStreakDays).toBe(7);
    expect(crossing.badgesEarned).toContain('on-fire');
    // Idempotence guard: already at 7+ does not re-earn.
    const beyond = applyGamificationEvent(
      { ...fresh, streakDays: 7, lastActiveAt: YESTERDAY },
      { kind: 'lesson', sourceRef: 's' },
      NOW,
    );
    expect(beyond.badgesEarned).not.toContain('on-fire');
  });

  it('awards arcade-initiate on the first game result only', () => {
    const first = applyGamificationEvent(
      fresh,
      { kind: 'game', game: 'hazard-hunter', score: 100, sourceRef: 'gameResults/r1' },
      NOW,
    );
    expect(first.badgesEarned).toContain('arcade-initiate');
    expect(first.gamesPlayed).toBe(1);
    const second = applyGamificationEvent(
      { ...fresh, gamesPlayed: 1 },
      { kind: 'game', game: 'hazard-hunter', score: 100, sourceRef: 'gameResults/r2' },
      NOW,
    );
    expect(second.badgesEarned).not.toContain('arcade-initiate');
  });

  it('awards high-roller on every peril win, never on losses or hazard-hunter', () => {
    const win = applyGamificationEvent(
      { ...fresh, gamesPlayed: 3 },
      { kind: 'game', game: 'peril', score: 900, won: true, sourceRef: 'gameResults/r1' },
      NOW,
    );
    expect(win.badgesEarned).toContain('high-roller');
    const loss = applyGamificationEvent(
      { ...fresh, gamesPlayed: 3 },
      { kind: 'game', game: 'peril', score: 900, won: false, sourceRef: 'gameResults/r2' },
      NOW,
    );
    expect(loss.badgesEarned).not.toContain('high-roller');
    const hazard = applyGamificationEvent(
      { ...fresh, gamesPlayed: 3 },
      { kind: 'game', game: 'hazard-hunter', score: 900, won: true, sourceRef: 'gameResults/r3' },
      NOW,
    );
    expect(hazard.badgesEarned).not.toContain('high-roller');
  });

  it('never touches course counters on lesson or game events', () => {
    const lesson = applyGamificationEvent(
      { ...fresh, completedCourses: 2 },
      { kind: 'lesson', sourceRef: 's' },
      NOW,
    );
    expect(lesson.completedCourses).toBe(2);
    expect(lesson.gamesPlayed).toBe(0);
  });
});

describe('memberStateOf / stateAfter', () => {
  it('extracts only well-typed fields from a raw member doc', () => {
    expect(
      memberStateOf({
        xp: 120,
        level: 'two',
        streakDays: 4,
        lastActiveAt: 42,
        completedCourses: 1,
        email: 'x@y.z',
      }),
    ).toEqual({ xp: 120, streakDays: 4, completedCourses: 1 });
  });

  it('folds: stateAfter feeds the next event with updated counters and lastActiveAt', () => {
    const result = applyGamificationEvent(fresh, { kind: 'lesson', sourceRef: 's' }, NOW);
    const next = stateAfter(result, NOW);
    expect(next).toEqual({
      xp: 50,
      level: 1,
      streakDays: 1,
      lastActiveAt: NOW,
      completedCourses: 0,
      gamesPlayed: 0,
    });
    // Same-day second event: streak stays, XP accumulates.
    const second = applyGamificationEvent(next, { kind: 'lesson', sourceRef: 's2' }, NOW);
    expect(second.newXp).toBe(100);
    expect(second.newStreakDays).toBe(1);
  });
});
