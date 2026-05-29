import { updateStreak } from './streaks';

describe('updateStreak', () => {
  describe('no prior activity', () => {
    it('starts streak at 1 when lastActiveISO is undefined', () => {
      const result = updateStreak(undefined, '2024-03-15T10:00:00.000Z', 0);
      expect(result).toEqual({ streakDays: 1, incremented: true });
    });

    it('starts streak at 1 when lastActiveISO is null (runtime null)', () => {
      // TypeScript signature uses undefined, but runtime docs may send null
      const result = updateStreak(null as unknown as undefined, '2024-03-15T10:00:00.000Z', 0);
      expect(result).toEqual({ streakDays: 1, incremented: true });
    });

    it('ignores currentStreak value when no prior activity', () => {
      // Even if currentStreak was somehow 5, a fresh start should yield 1.
      const result = updateStreak(undefined, '2024-03-15T10:00:00.000Z', 5);
      expect(result).toEqual({ streakDays: 1, incremented: true });
    });
  });

  describe('same calendar day (UTC) — idempotent', () => {
    it('does not increment when both timestamps are on the same UTC day', () => {
      const result = updateStreak(
        '2024-03-15T08:00:00.000Z',
        '2024-03-15T22:59:59.999Z',
        3,
      );
      expect(result).toEqual({ streakDays: 3, incremented: false });
    });

    it('does not increment for identical timestamps', () => {
      const result = updateStreak(
        '2024-06-01T00:00:00.000Z',
        '2024-06-01T00:00:00.000Z',
        7,
      );
      expect(result).toEqual({ streakDays: 7, incremented: false });
    });

    it('uses UTC date — late-night local time that crosses UTC midnight increments', () => {
      // lastActive: 2024-03-15T23:00:00+02:00 → UTC 2024-03-15T21:00:00Z → date 2024-03-15
      // now: 2024-03-16T01:00:00+02:00 → UTC 2024-03-15T23:00:00Z → date 2024-03-15 (same UTC day)
      const result = updateStreak(
        '2024-03-15T23:00:00+02:00',
        '2024-03-16T01:00:00+02:00',
        4,
      );
      // Both are the same UTC day (2024-03-15), so no increment
      expect(result.incremented).toBe(false);
      expect(result.streakDays).toBe(4);
    });
  });

  describe('consecutive day (+1)', () => {
    it('increments streak by 1 for consecutive UTC days', () => {
      const result = updateStreak(
        '2024-03-14T23:00:00.000Z',
        '2024-03-15T01:00:00.000Z',
        5,
      );
      expect(result).toEqual({ streakDays: 6, incremented: true });
    });

    it('increments from 0 to 1 on consecutive day', () => {
      const result = updateStreak(
        '2024-01-01T12:00:00.000Z',
        '2024-01-02T12:00:00.000Z',
        1,
      );
      expect(result).toEqual({ streakDays: 2, incremented: true });
    });

    it('handles year-boundary consecutive days', () => {
      const result = updateStreak(
        '2023-12-31T23:00:00.000Z',
        '2024-01-01T00:30:00.000Z',
        10,
      );
      expect(result).toEqual({ streakDays: 11, incremented: true });
    });

    it('handles month-boundary consecutive days', () => {
      const result = updateStreak(
        '2024-01-31T20:00:00.000Z',
        '2024-02-01T08:00:00.000Z',
        3,
      );
      expect(result).toEqual({ streakDays: 4, incremented: true });
    });

    it('handles Feb→Mar leap year boundary', () => {
      const result = updateStreak(
        '2024-02-28T20:00:00.000Z', // 2024 is a leap year
        '2024-02-29T10:00:00.000Z',
        2,
      );
      expect(result).toEqual({ streakDays: 3, incremented: true });
    });
  });

  describe('gap > 1 day — streak reset', () => {
    it('resets streak to 1 after a 2-day gap', () => {
      const result = updateStreak(
        '2024-03-13T10:00:00.000Z',
        '2024-03-15T10:00:00.000Z',
        8,
      );
      expect(result).toEqual({ streakDays: 1, incremented: true });
    });

    it('resets streak to 1 after a week gap', () => {
      const result = updateStreak(
        '2024-01-01T10:00:00.000Z',
        '2024-01-08T10:00:00.000Z',
        30,
      );
      expect(result).toEqual({ streakDays: 1, incremented: true });
    });

    it('resets streak to 1 after a year gap', () => {
      const result = updateStreak(
        '2023-01-01T10:00:00.000Z',
        '2024-01-01T10:00:00.000Z',
        100,
      );
      expect(result).toEqual({ streakDays: 1, incremented: true });
    });

    it('resets even when gap is exactly 2 days', () => {
      const result = updateStreak(
        '2024-06-01T12:00:00.000Z',
        '2024-06-03T12:00:00.000Z',
        5,
      );
      expect(result).toEqual({ streakDays: 1, incremented: true });
    });
  });

  describe('UTC date-only comparison correctness', () => {
    it('treats different UTC dates as different even if close in wall-clock time', () => {
      // 1 minute past UTC midnight = new day
      const result = updateStreak(
        '2024-05-14T23:59:00.000Z',
        '2024-05-15T00:01:00.000Z',
        2,
      );
      expect(result).toEqual({ streakDays: 3, incremented: true });
    });

    it('normalises non-UTC offsets to UTC before comparing', () => {
      // lastActive: 2024-03-15T01:00:00+05:30 = 2024-03-14T19:30:00Z (UTC date: 2024-03-14)
      // now:        2024-03-16T00:00:00+05:30 = 2024-03-15T18:30:00Z (UTC date: 2024-03-15)
      // Diff = 1 calendar day → should increment
      const result = updateStreak(
        '2024-03-15T01:00:00+05:30',
        '2024-03-16T00:00:00+05:30',
        3,
      );
      expect(result).toEqual({ streakDays: 4, incremented: true });
    });
  });
});
