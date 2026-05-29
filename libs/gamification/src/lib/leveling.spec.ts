import { levelForXp, xpForLevel, LevelCurve } from './leveling';

describe('xpForLevel', () => {
  describe('default curve (baseXp=100, exponent=1.5)', () => {
    it('returns floor(100 * N^1.5) for level 1', () => {
      expect(xpForLevel(1)).toBe(100); // floor(100 * 1^1.5) = 100
    });

    it('returns correct value for level 2', () => {
      expect(xpForLevel(2)).toBe(Math.floor(100 * Math.pow(2, 1.5))); // 282
    });

    it('returns correct value for level 3', () => {
      expect(xpForLevel(3)).toBe(Math.floor(100 * Math.pow(3, 1.5))); // 519
    });

    it('returns correct value for level 4', () => {
      expect(xpForLevel(4)).toBe(Math.floor(100 * Math.pow(4, 1.5))); // 800
    });

    it('returns correct value for level 10', () => {
      expect(xpForLevel(10)).toBe(Math.floor(100 * Math.pow(10, 1.5))); // 3162
    });

    it('is monotonically increasing', () => {
      for (let lvl = 1; lvl < 50; lvl++) {
        expect(xpForLevel(lvl + 1)).toBeGreaterThan(xpForLevel(lvl));
      }
    });

    it('produces only integer results', () => {
      for (let lvl = 1; lvl <= 20; lvl++) {
        expect(Number.isInteger(xpForLevel(lvl))).toBe(true);
      }
    });
  });

  describe('custom curve', () => {
    const customCurve: LevelCurve = { baseXp: 200, exponent: 2 };

    it('applies custom baseXp and exponent', () => {
      expect(xpForLevel(3, customCurve)).toBe(Math.floor(200 * Math.pow(3, 2))); // 1800
    });

    it('respects custom curve monotonically', () => {
      for (let lvl = 1; lvl < 20; lvl++) {
        expect(xpForLevel(lvl + 1, customCurve)).toBeGreaterThan(
          xpForLevel(lvl, customCurve),
        );
      }
    });
  });

  describe('invalid inputs', () => {
    it('throws for level 0', () => {
      expect(() => xpForLevel(0)).toThrow(RangeError);
    });

    it('throws for negative level', () => {
      expect(() => xpForLevel(-1)).toThrow(RangeError);
    });

    it('throws for non-integer level', () => {
      expect(() => xpForLevel(1.5)).toThrow(RangeError);
    });
  });
});

describe('levelForXp', () => {
  describe('default curve', () => {
    it('returns level 1 at 0 XP (starting state)', () => {
      const result = levelForXp(0);
      expect(result.level).toBe(1);
      expect(result.xpIntoLevel).toBe(0);
    });

    it('stays at level 1 just below the level-2 threshold', () => {
      const threshold2 = xpForLevel(2); // 282
      const result = levelForXp(threshold2 - 1);
      expect(result.level).toBe(1);
    });

    it('advances to level 2 exactly at the level-2 threshold', () => {
      const threshold2 = xpForLevel(2);
      const result = levelForXp(threshold2);
      expect(result.level).toBe(2);
    });

    it('returns correct xpIntoLevel at level 2 threshold', () => {
      const threshold2 = xpForLevel(2);
      const result = levelForXp(threshold2);
      // At exactly the threshold for level 2, xpIntoLevel = threshold2 - threshold2 = 0
      expect(result.xpIntoLevel).toBe(0);
    });

    it('returns correct xpIntoLevel with excess XP', () => {
      const threshold2 = xpForLevel(2);
      const result = levelForXp(threshold2 + 50);
      expect(result.xpIntoLevel).toBe(50);
    });

    it('advances to level 3 at xpForLevel(3)', () => {
      const threshold3 = xpForLevel(3);
      const result = levelForXp(threshold3);
      expect(result.level).toBe(3);
    });

    it('is inverse-ish: levelForXp(xpForLevel(N)).level === N for N=1..20', () => {
      for (let n = 1; n <= 20; n++) {
        const xp = xpForLevel(n);
        const info = levelForXp(xp);
        expect(info.level).toBe(n);
      }
    });

    it('xpIntoLevel is always non-negative', () => {
      const testXps = [0, 50, 100, 283, 500, 1000, 5000];
      for (const xp of testXps) {
        expect(levelForXp(xp).xpIntoLevel).toBeGreaterThanOrEqual(0);
      }
    });

    it('xpToNext is always positive', () => {
      const testXps = [0, 50, 100, 283, 500, 1000, 5000];
      for (const xp of testXps) {
        expect(levelForXp(xp).xpToNext).toBeGreaterThan(0);
      }
    });

    it('xpIntoLevel < xpToNext always (within-level progress constraint)', () => {
      // At the threshold xpIntoLevel=0, xpToNext = cost to next level
      // At just below next threshold, xpIntoLevel should be < xpToNext
      const testXps = [0, 50, 99, 100, 282, 283, 519, 520, 800];
      for (const xp of testXps) {
        const info = levelForXp(xp);
        expect(info.xpIntoLevel).toBeLessThan(info.xpToNext);
      }
    });

    it('returns level 1 with correct xpToNext at 0 XP', () => {
      const result = levelForXp(0);
      // xpToNext = cost to go from level 1 → level 2 = xpForLevel(2) - 0 (baseline for level 1)
      expect(result.xpToNext).toBe(xpForLevel(2));
    });
  });

  describe('custom curve', () => {
    const flatCurve: LevelCurve = { baseXp: 50, exponent: 1 };

    it('uses custom curve to compute levels', () => {
      // xpForLevel(1) = 50, xpForLevel(2) = 100, xpForLevel(3) = 150
      const at100 = levelForXp(100, flatCurve);
      expect(at100.level).toBe(2);
    });

    it('inverse-ish holds for custom curve', () => {
      for (let n = 1; n <= 10; n++) {
        const xp = xpForLevel(n, flatCurve);
        expect(levelForXp(xp, flatCurve).level).toBe(n);
      }
    });
  });

  describe('invalid inputs', () => {
    it('throws for negative XP', () => {
      expect(() => levelForXp(-1)).toThrow(RangeError);
    });
  });
});
