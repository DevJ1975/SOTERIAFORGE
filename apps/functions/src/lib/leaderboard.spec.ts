import {
  LEADERBOARD_MAX_ENTRIES,
  applyLeaderboardEntry,
  type LeaderboardEntryData,
} from './leaderboard';

const entry = (uid: string, xp: number): LeaderboardEntryData => ({ uid, displayName: uid, xp });

describe('applyLeaderboardEntry', () => {
  it('adds a brand-new entry, sorted and ranked', () => {
    const result = applyLeaderboardEntry([entry('a', 300)], { uid: 'b' }, 'set', 500);
    expect(result).toEqual([
      { uid: 'b', displayName: undefined, avatarUrl: undefined, xp: 500, rank: 1 },
      { uid: 'a', displayName: 'a', avatarUrl: undefined, xp: 300, rank: 2 },
    ]);
  });

  it("mode 'set' replaces an existing member's xp (allTime / cumulative)", () => {
    const before = [entry('a', 300), entry('b', 200)];
    const result = applyLeaderboardEntry(before, { uid: 'b' }, 'set', 999);
    expect(result.find((e) => e.uid === 'b')?.xp).toBe(999);
    expect(result[0]).toMatchObject({ uid: 'b', xp: 999, rank: 1 });
    // 'a' is untouched.
    expect(result.find((e) => e.uid === 'a')?.xp).toBe(300);
  });

  it("mode 'add' accumulates onto an existing member's xp (daily/weekly period)", () => {
    const before = [entry('a', 50)];
    const result = applyLeaderboardEntry(before, { uid: 'a' }, 'add', 30);
    expect(result.find((e) => e.uid === 'a')?.xp).toBe(80);
  });

  it("mode 'add' starts from 0 for a member with no prior entry (post-reset growth)", () => {
    const result = applyLeaderboardEntry([], { uid: 'a' }, 'add', 40);
    expect(result).toEqual([
      { uid: 'a', displayName: undefined, avatarUrl: undefined, xp: 40, rank: 1 },
    ]);
  });

  it('re-sorts by xp descending and re-ranks 1..N', () => {
    const before = [entry('a', 100), entry('b', 200), entry('c', 50)];
    const result = applyLeaderboardEntry(before, { uid: 'c' }, 'add', 1000);
    expect(result.map((e) => e.uid)).toEqual(['c', 'b', 'a']);
    expect(result.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('refreshes stored profile fields, falling back to existing when omitted', () => {
    const before: LeaderboardEntryData[] = [
      { uid: 'a', displayName: 'Old', avatarUrl: 'https://x/old.png', xp: 10 },
    ];
    // New displayName provided, avatarUrl omitted → keep the old avatar.
    const result = applyLeaderboardEntry(before, { uid: 'a', displayName: 'New' }, 'add', 5);
    expect(result[0]).toMatchObject({ displayName: 'New', avatarUrl: 'https://x/old.png', xp: 15 });
  });

  it(`truncates to the top ${LEADERBOARD_MAX_ENTRIES} entries`, () => {
    const before = Array.from({ length: LEADERBOARD_MAX_ENTRIES }, (_, i) =>
      entry(`u${i}`, 1000 - i),
    );
    // New entry has the lowest xp → it should fall off after truncation.
    const result = applyLeaderboardEntry(before, { uid: 'low' }, 'set', 1);
    expect(result).toHaveLength(LEADERBOARD_MAX_ENTRIES);
    expect(result.some((e) => e.uid === 'low')).toBe(false);

    // A new top entry pushes the previous last entry off.
    const result2 = applyLeaderboardEntry(before, { uid: 'top' }, 'set', 100000);
    expect(result2).toHaveLength(LEADERBOARD_MAX_ENTRIES);
    expect(result2[0]).toMatchObject({ uid: 'top', rank: 1 });
    expect(result2.some((e) => e.uid === `u${LEADERBOARD_MAX_ENTRIES - 1}`)).toBe(false);
  });

  it('does not mutate the input array', () => {
    const before = [entry('a', 10)];
    const frozen = Object.freeze([...before]);
    applyLeaderboardEntry(frozen, { uid: 'a' }, 'add', 5);
    expect(before).toEqual([entry('a', 10)]);
  });
});
