import { awardSchema, mergeBadgeWall, PLATFORM_BADGE_INFO, type BadgeAward } from './badges';

const award = (badgeId: string, overrides: Partial<BadgeAward> = {}): BadgeAward => ({
  badgeId,
  name: `Award ${badgeId}`,
  description: `Earned ${badgeId}`,
  earnedAt: '2026-06-01T12:00:00.000Z',
  ...overrides,
});

describe('PLATFORM_BADGE_INFO', () => {
  it('lists the six platform badges in display order', () => {
    expect(PLATFORM_BADGE_INFO.map((badge) => badge.id)).toEqual([
      'first-steps',
      'course-crusher',
      'on-fire',
      'sharpshooter',
      'arcade-initiate',
      'high-roller',
    ]);
  });
});

describe('awardSchema', () => {
  it('parses the award contract shape', () => {
    const parsed = awardSchema.parse({
      badgeId: 'first-steps',
      name: 'First Steps',
      description: 'Complete your first course',
      earnedAt: '2026-06-01T12:00:00.000Z',
      credential: { type: 'OpenBadgeCredential' },
    });
    expect(parsed.badgeId).toBe('first-steps');
    expect(parsed.credential).toEqual({ type: 'OpenBadgeCredential' });
  });

  it('rejects awards without an earnedAt', () => {
    expect(awardSchema.safeParse({ badgeId: 'x', name: 'X' }).success).toBe(false);
  });
});

describe('mergeBadgeWall', () => {
  it('returns all platform badges locked when nothing is earned', () => {
    const tiles = mergeBadgeWall([]);
    expect(tiles).toHaveLength(PLATFORM_BADGE_INFO.length);
    expect(tiles.every((tile) => !tile.earned && tile.earnedAt === undefined)).toBe(true);
    // Locked tiles show the criteria narrative.
    expect(tiles[0]).toMatchObject({
      id: 'first-steps',
      name: 'First Steps',
      description: 'Complete your first course',
    });
  });

  it('marks earned badges with the award name/date, keeping catalog order', () => {
    const tiles = mergeBadgeWall([
      award('on-fire', { name: 'On Fire', earnedAt: '2026-05-30T08:00:00.000Z' }),
    ]);
    expect(tiles.map((tile) => tile.id)).toEqual(PLATFORM_BADGE_INFO.map((badge) => badge.id));
    const onFire = tiles.find((tile) => tile.id === 'on-fire');
    expect(onFire).toMatchObject({
      earned: true,
      name: 'On Fire',
      earnedAt: '2026-05-30T08:00:00.000Z',
    });
    expect(tiles.filter((tile) => tile.earned)).toHaveLength(1);
  });

  it('falls back to catalog name/criteria when the award carries empty strings', () => {
    const tiles = mergeBadgeWall([award('first-steps', { name: 'x', description: '' })]);
    const firstSteps = tiles.find((tile) => tile.id === 'first-steps');
    expect(firstSteps?.description).toBe('Complete your first course');
  });

  it('appends earned awards that are not in the platform catalog', () => {
    const tiles = mergeBadgeWall([award('tenant-custom', { name: 'Forklift Hero' })]);
    expect(tiles).toHaveLength(PLATFORM_BADGE_INFO.length + 1);
    expect(tiles.at(-1)).toMatchObject({
      id: 'tenant-custom',
      name: 'Forklift Hero',
      earned: true,
    });
  });
});
