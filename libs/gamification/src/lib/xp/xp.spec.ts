import {
  BASE_XP,
  DEFAULT_COURSE_XP,
  MIN_LEVEL,
  courseCompletionXp,
  levelForXp,
  levelProgress,
  xpForLevel,
} from './xp';

describe('xpForLevel', () => {
  it('puts the level 1 floor at zero xp', () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it('follows the triangular curve BASE * (L-1) * L / 2', () => {
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
    expect(xpForLevel(5)).toBe(1000);
    expect(xpForLevel(10)).toBe((BASE_XP * 9 * 10) / 2);
  });

  it('clamps levels below the minimum to the floor', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-5)).toBe(0);
    expect(xpForLevel(Number.NaN)).toBe(0);
  });

  it('floors fractional levels', () => {
    expect(xpForLevel(3.9)).toBe(xpForLevel(3));
  });

  it('is strictly increasing across levels', () => {
    for (let l = MIN_LEVEL; l < 100; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });
});

describe('levelForXp', () => {
  it('treats anything below the first threshold as level 1', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(1)).toBe(1);
    expect(levelForXp(99)).toBe(1);
  });

  it('clamps negative / non-finite xp to the minimum level', () => {
    expect(levelForXp(-1)).toBe(MIN_LEVEL);
    expect(levelForXp(-9999)).toBe(MIN_LEVEL);
    expect(levelForXp(Number.NaN)).toBe(MIN_LEVEL);
    expect(levelForXp(Number.POSITIVE_INFINITY)).toBe(MIN_LEVEL);
  });

  it('lands exactly on each threshold (no float drift)', () => {
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    expect(levelForXp(600)).toBe(4);
    expect(levelForXp(1000)).toBe(5);
  });

  it('stays on the lower level one xp before a threshold', () => {
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(599)).toBe(3);
  });

  it('advances on the level just past a threshold', () => {
    expect(levelForXp(101)).toBe(2);
    expect(levelForXp(301)).toBe(3);
  });

  it('is monotonic and non-decreasing as xp grows', () => {
    let prev = levelForXp(0);
    for (let xp = 0; xp <= 20000; xp += 7) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });

  it('is the inverse of xpForLevel at every threshold', () => {
    for (let l = MIN_LEVEL; l <= 100; l++) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
    }
  });
});

describe('levelProgress', () => {
  it('reports zero progress at the start of a level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, intoLevel: 0, span: 100, pct: 0 });
    expect(levelProgress(300)).toEqual({ level: 3, intoLevel: 0, span: 300, pct: 0 });
  });

  it('reports partial progress within a level', () => {
    const p = levelProgress(50);
    expect(p.level).toBe(1);
    expect(p.intoLevel).toBe(50);
    expect(p.span).toBe(100);
    expect(p.pct).toBeCloseTo(0.5, 10);
  });

  it('computes intoLevel and span relative to the bracketing thresholds', () => {
    // Level 3 spans [300, 600); 450 is halfway.
    const p = levelProgress(450);
    expect(p.level).toBe(3);
    expect(p.intoLevel).toBe(150);
    expect(p.span).toBe(300);
    expect(p.pct).toBeCloseTo(0.5, 10);
  });

  it('clamps pct into [0, 1] for degenerate / negative input', () => {
    const lo = levelProgress(-100);
    expect(lo.level).toBe(1);
    expect(lo.intoLevel).toBe(0);
    expect(lo.pct).toBe(0);
  });

  it('keeps pct in [0, 1] across a wide sweep', () => {
    for (let xp = 0; xp <= 20000; xp += 13) {
      const p = levelProgress(xp);
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(1);
      expect(p.span).toBeGreaterThan(0);
      expect(p.intoLevel).toBeGreaterThanOrEqual(0);
      expect(p.intoLevel).toBeLessThan(p.span);
      expect(p.level).toBe(levelForXp(xp));
    }
  });
});

describe('courseCompletionXp', () => {
  it('uses the course xpReward when present', () => {
    expect(courseCompletionXp({ xpReward: 250 })).toBe(250);
    expect(courseCompletionXp({ xpReward: 0 })).toBe(0);
  });

  it('floors fractional rewards', () => {
    expect(courseCompletionXp({ xpReward: 149.9 })).toBe(149);
  });

  it('falls back to the default when xpReward is missing or invalid', () => {
    expect(courseCompletionXp({})).toBe(DEFAULT_COURSE_XP);
    expect(courseCompletionXp({ xpReward: undefined })).toBe(DEFAULT_COURSE_XP);
    expect(courseCompletionXp({ xpReward: -10 })).toBe(DEFAULT_COURSE_XP);
    expect(courseCompletionXp({ xpReward: Number.NaN })).toBe(DEFAULT_COURSE_XP);
  });
});
