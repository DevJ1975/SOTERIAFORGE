import {
  STREAK_REMINDER_DECAY_DAYS,
  levelFromXp,
  nextStreak,
  shouldSendStreakReminder,
  xpForLevel,
} from './gamification';

describe('xpForLevel (canonical floored curve)', () => {
  it('is floor(100 * N^1.5) — the floor is load-bearing for client/server parity', () => {
    expect(xpForLevel(1)).toBe(100); // floor(100 * 1^1.5)
    expect(xpForLevel(2)).toBe(282); // floor(282.84…) — NOT 283
    expect(xpForLevel(3)).toBe(519); // floor(519.61…)
    expect(xpForLevel(4)).toBe(800); // floor(800)
  });
});

describe('levelFromXp', () => {
  it('starts at level 1 and is monotonic non-decreasing', () => {
    expect(levelFromXp(0)).toBe(1);
    let prev = 1;
    for (let xp = 0; xp <= 5000; xp += 137) {
      const l = levelFromXp(xp);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });

  // MO-13a: with the missing Math.floor restored, the level-2 boundary is 282,
  // not 283 — matching the client's floored curve so the displayed level no
  // longer flickers against the authoritative server level.
  it('uses the floored boundaries (281→1, 282→2, 518→2, 519→3, 799→3, 800→4)', () => {
    expect(levelFromXp(281)).toBe(1);
    expect(levelFromXp(282)).toBe(2);
    expect(levelFromXp(518)).toBe(2);
    expect(levelFromXp(519)).toBe(3);
    expect(levelFromXp(799)).toBe(3);
    expect(levelFromXp(800)).toBe(4);
  });

  it('reaches level N exactly at xpForLevel(N)', () => {
    for (let n = 1; n <= 30; n++) {
      expect(levelFromXp(xpForLevel(n))).toBe(n);
      expect(levelFromXp(xpForLevel(n) - 1)).toBe(n - 1 || 1);
    }
  });
});

describe('nextStreak', () => {
  it('initializes when there is no prior activity', () => {
    expect(nextStreak(undefined, '2026-01-02T10:00:00Z', 0)).toEqual({
      streakDays: 1,
      incremented: true,
    });
  });

  it('does not change on the same UTC day', () => {
    expect(nextStreak('2026-01-02T01:00:00Z', '2026-01-02T23:00:00Z', 4)).toEqual({
      streakDays: 4,
      incremented: false,
    });
  });

  it('increments on the next consecutive day', () => {
    expect(nextStreak('2026-01-02T23:00:00Z', '2026-01-03T01:00:00Z', 4)).toEqual({
      streakDays: 5,
      incremented: true,
    });
  });

  it('resets to 1 after a gap', () => {
    expect(nextStreak('2026-01-02T10:00:00Z', '2026-01-05T10:00:00Z', 4)).toEqual({
      streakDays: 1,
      incremented: true,
    });
  });
});

describe('shouldSendStreakReminder (MO-11 selection + daily cap)', () => {
  const NOW = '2026-06-20T18:00:00Z';

  it('nudges the canonical at-risk member: active yesterday, live streak, not yet reminded', () => {
    expect(
      shouldSendStreakReminder({ streakDays: 5, lastActiveAt: '2026-06-19T20:00:00Z' }, NOW),
    ).toBe(true);
  });

  it('does not nudge when there is no streak to protect (streakDays = 0)', () => {
    expect(
      shouldSendStreakReminder({ streakDays: 0, lastActiveAt: '2026-06-19T20:00:00Z' }, NOW),
    ).toBe(false);
  });

  it('does not nudge a member who has already been active today (streak safe)', () => {
    expect(
      shouldSendStreakReminder({ streakDays: 5, lastActiveAt: '2026-06-20T08:00:00Z' }, NOW),
    ).toBe(false);
  });

  it('does not nudge when lastActiveAt is missing', () => {
    expect(shouldSendStreakReminder({ streakDays: 5 }, NOW)).toBe(false);
  });

  it('still nudges within the 7-day decay window but not beyond it', () => {
    // 6 days inactive — inside the window.
    expect(
      shouldSendStreakReminder({ streakDays: 9, lastActiveAt: '2026-06-14T12:00:00Z' }, NOW),
    ).toBe(true);
    // Exactly 7 days inactive — boundary, still inside.
    expect(
      shouldSendStreakReminder({ streakDays: 9, lastActiveAt: '2026-06-13T12:00:00Z' }, NOW),
    ).toBe(true);
    // 8 days inactive — abandoned, stop nudging.
    expect(
      shouldSendStreakReminder({ streakDays: 9, lastActiveAt: '2026-06-12T12:00:00Z' }, NOW),
    ).toBe(false);
    // Sanity: the constant is the window we tested against.
    expect(STREAK_REMINDER_DECAY_DAYS).toBe(7);
  });

  it('enforces the daily cap: skip when already reminded today (idempotent)', () => {
    expect(
      shouldSendStreakReminder(
        {
          streakDays: 5,
          lastActiveAt: '2026-06-19T20:00:00Z',
          lastStreakReminderAt: '2026-06-20T06:00:00Z',
        },
        NOW,
      ),
    ).toBe(false);
  });

  it('nudges again the next day after a prior reminder (cap is per-day)', () => {
    expect(
      shouldSendStreakReminder(
        {
          streakDays: 5,
          lastActiveAt: '2026-06-19T20:00:00Z',
          lastStreakReminderAt: '2026-06-19T18:00:00Z',
        },
        NOW,
      ),
    ).toBe(true);
  });
});
