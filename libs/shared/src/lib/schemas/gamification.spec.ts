import {
  GAME_IDS,
  PLATFORM_BADGES,
  badgeAward,
  gameResult,
  levelForXp,
  platformBadgeById,
  xpEvent,
  xpForLevel,
} from './gamification';

describe('level curve', () => {
  it('computes the documented cumulative thresholds', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
    expect(xpForLevel(5)).toBe(1000);
    expect(xpForLevel(10)).toBe(4500);
  });

  it('rejects non-positive or fractional levels', () => {
    expect(() => xpForLevel(0)).toThrow(RangeError);
    expect(() => xpForLevel(-3)).toThrow(RangeError);
    expect(() => xpForLevel(2.5)).toThrow(RangeError);
  });

  it('maps XP to levels exactly at the boundaries', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    expect(levelForXp(599)).toBe(3);
    expect(levelForXp(600)).toBe(4);
    expect(levelForXp(999)).toBe(4);
    expect(levelForXp(1000)).toBe(5);
  });

  it('clamps negative or non-finite XP to level 1', () => {
    expect(levelForXp(-50)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });

  it('round-trips: levelForXp(xpForLevel(n)) === n for n = 1..50', () => {
    for (let n = 1; n <= 50; n++) {
      expect(levelForXp(xpForLevel(n))).toBe(n);
      expect(levelForXp(xpForLevel(n) - 1)).toBe(Math.max(1, n - 1));
    }
  });
});

describe('xpEvent', () => {
  const base = {
    id: 'evt-1',
    uid: 'u1',
    tenantId: 'acme',
    amount: 50,
    reason: 'lesson_completed',
    sourceRef: 'courses/c1/lessons/l1',
    at: '2026-06-11T12:00:00.000Z',
  };

  it('parses a valid event', () => {
    expect(xpEvent.parse(base)).toMatchObject({ amount: 50, reason: 'lesson_completed' });
  });

  it('rejects fractional amounts and unknown reasons', () => {
    expect(xpEvent.safeParse({ ...base, amount: 12.5 }).success).toBe(false);
    expect(xpEvent.safeParse({ ...base, reason: 'attendance' }).success).toBe(false);
  });
});

describe('badgeAward', () => {
  it('parses an award and defaults the description', () => {
    const parsed = badgeAward.parse({
      badgeId: 'first-steps',
      name: 'First Steps',
      earnedAt: '2026-06-11T12:00:00.000Z',
      credential: { type: ['VerifiableCredential', 'OpenBadgeCredential'] },
    });
    expect(parsed.description).toBe('');
    expect(parsed.credential['type']).toContain('OpenBadgeCredential');
  });

  it('requires a credential object', () => {
    expect(
      badgeAward.safeParse({
        badgeId: 'first-steps',
        name: 'First Steps',
        earnedAt: '2026-06-11T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('gameResult', () => {
  const base = {
    id: 'r1',
    uid: 'u1',
    tenantId: 'acme',
    game: 'hazard-hunter',
    score: 870,
    at: '2026-06-11T12:00:00.000Z',
  };

  it('parses a minimal result and an annotated one', () => {
    expect(gameResult.parse(base).xpAwarded).toBeUndefined();
    expect(
      gameResult.parse({ ...base, game: 'peril', won: true, maxScore: 1000, xpAwarded: 150 }),
    ).toMatchObject({ won: true, xpAwarded: 150 });
  });

  it('rejects unknown games and negative or fractional scores', () => {
    expect(gameResult.safeParse({ ...base, game: 'pong' }).success).toBe(false);
    expect(gameResult.safeParse({ ...base, score: -1 }).success).toBe(false);
    expect(gameResult.safeParse({ ...base, score: 1.5 }).success).toBe(false);
  });

  it('covers exactly the platform game ids', () => {
    expect(GAME_IDS).toEqual(['hazard-hunter', 'peril']);
  });
});

describe('PLATFORM_BADGES', () => {
  it('defines the six fixed badge ids', () => {
    expect(PLATFORM_BADGES.map((b) => b.id)).toEqual([
      'first-steps',
      'course-crusher',
      'on-fire',
      'sharpshooter',
      'arcade-initiate',
      'high-roller',
    ]);
  });

  it('gives every badge a name, description and criteria narrative', () => {
    for (const badge of PLATFORM_BADGES) {
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.description.length).toBeGreaterThan(0);
      expect(badge.criteria.length).toBeGreaterThan(0);
    }
  });

  it('looks badges up by id', () => {
    expect(platformBadgeById('on-fire')?.name).toBe('On Fire');
    expect(platformBadgeById('nope')).toBeUndefined();
  });
});
