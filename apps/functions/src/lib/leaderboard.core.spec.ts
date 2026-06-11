import {
  authorizeRebuild,
  isoWeekKey,
  LEADERBOARD_TOP_N,
  rankMembers,
  rebuildLeaderboardsCore,
  toMemberLite,
  utcDayKey,
  type LeaderboardDeps,
  type LeaderboardDocLite,
  type LeaderboardPeriod,
  type MemberLite,
} from './leaderboard.core';

/** In-memory fake of the leaderboard ports. */
class FakeLeaderboardDb implements LeaderboardDeps {
  members = new Map<string, MemberLite[]>();
  writes: Array<{ tenantId: string; period: LeaderboardPeriod; doc: LeaderboardDocLite }> = [];

  async listMembers(tenantId: string): Promise<MemberLite[]> {
    return this.members.get(tenantId) ?? [];
  }

  async setLeaderboard(
    tenantId: string,
    period: LeaderboardPeriod,
    doc: LeaderboardDocLite,
  ): Promise<void> {
    this.writes.push({ tenantId, period, doc });
  }

  board(period: LeaderboardPeriod): LeaderboardDocLite {
    const write = this.writes.find((entry) => entry.period === period);
    if (!write) throw new Error(`no ${period} leaderboard written`);
    return write.doc;
  }
}

const member = (uid: string, xp: number, overrides: Partial<MemberLite> = {}): MemberLite => ({
  uid,
  xp,
  ...overrides,
});

// A Thursday: 2026-06-11 is in ISO week 2026-W24 (Mon 06-08 … Sun 06-14).
const NOW = new Date('2026-06-11T15:30:00.000Z');

describe('utcDayKey / isoWeekKey', () => {
  it('keys UTC calendar days', () => {
    expect(utcDayKey(NOW)).toBe('2026-06-11');
    expect(utcDayKey('2026-06-11T23:59:59.999Z')).toBe('2026-06-11');
    expect(utcDayKey('2026-06-12T00:00:00.000Z')).toBe('2026-06-12');
  });

  it('keys ISO weeks (Monday-based, week of the Thursday)', () => {
    expect(isoWeekKey(NOW)).toBe('2026-W24');
    expect(isoWeekKey('2026-06-08T00:00:00.000Z')).toBe('2026-W24'); // Monday
    expect(isoWeekKey('2026-06-14T23:59:59.000Z')).toBe('2026-W24'); // Sunday
    expect(isoWeekKey('2026-06-07T12:00:00.000Z')).toBe('2026-W23'); // previous Sunday
    // Year boundary: 2021-01-01 belongs to ISO week 2020-W53.
    expect(isoWeekKey('2021-01-01T12:00:00.000Z')).toBe('2020-W53');
    expect(isoWeekKey('2021-01-04T12:00:00.000Z')).toBe('2021-W01');
  });

  it('returns null for missing or invalid input', () => {
    expect(utcDayKey(undefined)).toBeNull();
    expect(utcDayKey('not-a-date')).toBeNull();
    expect(isoWeekKey(undefined)).toBeNull();
    expect(isoWeekKey('not-a-date')).toBeNull();
  });
});

describe('rankMembers', () => {
  it('ranks by xp descending with 1-based ranks', () => {
    const entries = rankMembers([member('a', 10), member('b', 500), member('c', 90)]);
    expect(entries.map((entry) => [entry.uid, entry.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('breaks xp ties stably by uid ascending', () => {
    const entries = rankMembers([member('zed', 100), member('amy', 100), member('mia', 100)]);
    expect(entries.map((entry) => entry.uid)).toEqual(['amy', 'mia', 'zed']);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it('omits undefined optional fields from entries (Firestore-safe)', () => {
    const [bare, full] = rankMembers([
      member('bare', 50),
      member('full', 10, { displayName: 'Full', avatarUrl: 'https://x.test/a.png' }),
    ]);
    expect('displayName' in bare).toBe(false);
    expect('avatarUrl' in bare).toBe(false);
    expect(full).toEqual({
      uid: 'full',
      displayName: 'Full',
      avatarUrl: 'https://x.test/a.png',
      xp: 10,
      rank: 2,
    });
  });
});

describe('rebuildLeaderboardsCore', () => {
  it('writes all three periods with the shared doc shape', async () => {
    const db = new FakeLeaderboardDb();
    db.members.set('acme', [member('u1', 100, { lastActiveAt: NOW.toISOString() })]);

    const result = await rebuildLeaderboardsCore(db, 'acme', NOW);

    expect(db.writes.map((write) => write.period).sort()).toEqual(['allTime', 'daily', 'weekly']);
    expect(result.counts).toEqual({ daily: 1, weekly: 1, allTime: 1 });
    const allTime = db.board('allTime');
    expect(allTime).toEqual({
      tenantId: 'acme',
      period: 'allTime',
      entries: [{ uid: 'u1', xp: 100, rank: 1 }],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
  });

  it('allTime ranks everyone regardless of lastActiveAt', async () => {
    const db = new FakeLeaderboardDb();
    db.members.set('acme', [
      member('dormant', 900), // no lastActiveAt at all
      member('old', 300, { lastActiveAt: '2024-01-01T00:00:00.000Z' }),
      member('fresh', 600, { lastActiveAt: NOW.toISOString() }),
    ]);

    await rebuildLeaderboardsCore(db, 'acme', NOW);

    expect(db.board('allTime').entries.map((entry) => entry.uid)).toEqual([
      'dormant',
      'fresh',
      'old',
    ]);
  });

  it('daily includes only members active within the UTC day of now', async () => {
    const db = new FakeLeaderboardDb();
    db.members.set('acme', [
      member('start-of-day', 10, { lastActiveAt: '2026-06-11T00:00:00.000Z' }),
      member('end-of-day', 20, { lastActiveAt: '2026-06-11T23:59:59.999Z' }),
      member('yesterday', 999, { lastActiveAt: '2026-06-10T23:59:59.999Z' }),
      member('tomorrow', 999, { lastActiveAt: '2026-06-12T00:00:00.000Z' }),
      member('never', 999),
      member('garbage', 999, { lastActiveAt: 'not-a-date' }),
    ]);

    await rebuildLeaderboardsCore(db, 'acme', NOW);

    expect(db.board('daily').entries.map((entry) => entry.uid)).toEqual([
      'end-of-day',
      'start-of-day',
    ]);
  });

  it('weekly includes only members active within the ISO week of now', async () => {
    const db = new FakeLeaderboardDb();
    db.members.set('acme', [
      member('monday', 10, { lastActiveAt: '2026-06-08T06:00:00.000Z' }),
      member('sunday', 20, { lastActiveAt: '2026-06-14T22:00:00.000Z' }),
      member('last-week', 999, { lastActiveAt: '2026-06-07T22:00:00.000Z' }),
      member('next-week', 999, { lastActiveAt: '2026-06-15T01:00:00.000Z' }),
    ]);

    await rebuildLeaderboardsCore(db, 'acme', NOW);

    expect(db.board('weekly').entries.map((entry) => entry.uid)).toEqual(['sunday', 'monday']);
  });

  it('handles the ISO-week year boundary', async () => {
    const db = new FakeLeaderboardDb();
    const newYears = new Date('2021-01-01T12:00:00.000Z'); // ISO week 2020-W53
    db.members.set('acme', [
      member('nye', 10, { lastActiveAt: '2020-12-31T23:00:00.000Z' }),
      member('w1', 20, { lastActiveAt: '2021-01-04T08:00:00.000Z' }), // 2021-W01
    ]);

    await rebuildLeaderboardsCore(db, 'acme', newYears);

    expect(db.board('weekly').entries.map((entry) => entry.uid)).toEqual(['nye']);
  });

  it('caps every period at the top 100', async () => {
    const db = new FakeLeaderboardDb();
    const roster = Array.from({ length: 120 }, (_, i) =>
      member(`u${String(i).padStart(3, '0')}`, i, { lastActiveAt: NOW.toISOString() }),
    );
    db.members.set('acme', roster);

    const result = await rebuildLeaderboardsCore(db, 'acme', NOW);

    expect(result.counts).toEqual({ daily: 100, weekly: 100, allTime: 100 });
    const entries = db.board('allTime').entries;
    expect(entries).toHaveLength(LEADERBOARD_TOP_N);
    expect(entries[0]).toMatchObject({ uid: 'u119', xp: 119, rank: 1 });
    expect(entries.at(-1)).toMatchObject({ uid: 'u020', xp: 20, rank: 100 });
  });

  it('writes empty boards for a tenant with no members', async () => {
    const db = new FakeLeaderboardDb();

    const result = await rebuildLeaderboardsCore(db, 'empty-tenant', NOW);

    expect(result.counts).toEqual({ daily: 0, weekly: 0, allTime: 0 });
    expect(db.writes).toHaveLength(3);
    for (const write of db.writes) {
      expect(write.doc.entries).toEqual([]);
      expect(write.doc.tenantId).toBe('empty-tenant');
    }
  });
});

describe('authorizeRebuild', () => {
  it('rejects unauthenticated and role-less callers', () => {
    expect(authorizeRebuild(undefined, undefined)).toMatchObject({
      ok: false,
      code: 'permission-denied',
    });
    expect(authorizeRebuild({}, 'acme')).toMatchObject({ ok: false });
  });

  it('rejects learners and b2c customers', () => {
    expect(authorizeRebuild({ role: 'learner', tenantId: 'acme' }, undefined)).toMatchObject({
      ok: false,
      code: 'permission-denied',
    });
    expect(authorizeRebuild({ role: 'b2c_customer', tenantId: 'b2c' }, undefined)).toMatchObject({
      ok: false,
    });
  });

  it('requires superadmin to name an explicit tenant', () => {
    expect(authorizeRebuild({ role: 'superadmin' }, undefined)).toMatchObject({
      ok: false,
      code: 'invalid-argument',
    });
    expect(authorizeRebuild({ role: 'superadmin' }, 'acme')).toEqual({
      ok: true,
      tenantId: 'acme',
    });
  });

  it('scopes authoring roles to their own tenant', () => {
    expect(authorizeRebuild({ role: 'tenant_admin', tenantId: 'acme' }, undefined)).toEqual({
      ok: true,
      tenantId: 'acme',
    });
    expect(authorizeRebuild({ role: 'instructor', tenantId: 'acme' }, 'acme')).toEqual({
      ok: true,
      tenantId: 'acme',
    });
    expect(authorizeRebuild({ role: 'tenant_admin', tenantId: 'acme' }, 'rival')).toMatchObject({
      ok: false,
      code: 'permission-denied',
    });
    expect(authorizeRebuild({ role: 'instructor' }, undefined)).toMatchObject({
      ok: false,
      code: 'permission-denied',
    });
  });
});

describe('toMemberLite', () => {
  it('projects a raw member doc defensively', () => {
    expect(
      toMemberLite('u1', {
        displayName: 'Ada',
        avatarUrl: 'https://x.test/ada.png',
        xp: 250,
        lastActiveAt: '2026-06-11T10:00:00.000Z',
        role: 'learner',
      }),
    ).toEqual({
      uid: 'u1',
      displayName: 'Ada',
      avatarUrl: 'https://x.test/ada.png',
      xp: 250,
      lastActiveAt: '2026-06-11T10:00:00.000Z',
    });
  });

  it('defaults missing/invalid xp to 0 and converts Timestamp-like lastActiveAt', () => {
    const timestampLike = { toDate: () => new Date('2026-06-11T10:00:00.000Z') };
    expect(toMemberLite('u2', { xp: 'lots', lastActiveAt: timestampLike })).toEqual({
      uid: 'u2',
      xp: 0,
      lastActiveAt: '2026-06-11T10:00:00.000Z',
    });
    expect(toMemberLite('u3', {})).toEqual({ uid: 'u3', xp: 0 });
  });
});
