import { levelFromXp, nextStreak } from './gamification';

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

  it('advances past the level-2 threshold (100 * 2^1.5 ≈ 283)', () => {
    expect(levelFromXp(282)).toBe(1);
    expect(levelFromXp(283)).toBe(2);
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
