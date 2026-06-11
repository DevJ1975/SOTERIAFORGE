import { levelProgress, xpForLevel } from './level';

describe('xpForLevel', () => {
  it('matches the 100·(n−1)·n/2 curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
    expect(xpForLevel(5)).toBe(1000);
    expect(xpForLevel(10)).toBe(4500);
  });

  it('clamps sub-1 levels to 0 XP', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-3)).toBe(0);
  });
});

describe('levelProgress', () => {
  // [xp, level, intoLevel, neededForNext, pct]
  const matrix: Array<[number, number, number, number, number]> = [
    [0, 1, 0, 100, 0],
    [1, 1, 1, 100, 1],
    [50, 1, 50, 100, 50],
    [99, 1, 99, 100, 99],
    [100, 2, 0, 200, 0], // exact threshold rolls into the new level
    [150, 2, 50, 200, 25],
    [299, 2, 199, 200, 100], // rounding caps at 100, never 100+
    [300, 3, 0, 300, 0],
    [599, 3, 299, 300, 100],
    [600, 4, 0, 400, 0],
    [1000, 5, 0, 500, 0],
    [1249, 5, 249, 500, 50],
    [4500, 10, 0, 1000, 0],
    [4999, 10, 499, 1000, 50],
  ];

  it.each(matrix)('xp=%d → L%d (%d / %d, %d%%)', (xp, level, intoLevel, neededForNext, pct) => {
    expect(levelProgress(xp)).toEqual({ level, intoLevel, neededForNext, pct });
  });

  it('clamps negative and non-finite xp to level 1 / 0 XP', () => {
    expect(levelProgress(-50)).toEqual({ level: 1, intoLevel: 0, neededForNext: 100, pct: 0 });
    expect(levelProgress(Number.NaN)).toEqual({
      level: 1,
      intoLevel: 0,
      neededForNext: 100,
      pct: 0,
    });
  });

  it('is consistent with xpForLevel across a sweep (no off-by-one drift)', () => {
    for (let level = 1; level <= 40; level++) {
      const threshold = xpForLevel(level);
      expect(levelProgress(threshold).level).toBe(level);
      if (level > 1) expect(levelProgress(threshold - 1).level).toBe(level - 1);
    }
  });
});
