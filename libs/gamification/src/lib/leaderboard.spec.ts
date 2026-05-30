import { rankEntries, RankInput } from './leaderboard';
import { LeaderboardEntry } from '@assurance/shared';

describe('rankEntries', () => {
  describe('empty input', () => {
    it('returns an empty array for empty input', () => {
      expect(rankEntries([])).toEqual([]);
    });
  });

  describe('single entry', () => {
    it('assigns rank 1 to a single entry', () => {
      const input: RankInput[] = [{ uid: 'user1', xp: 500 }];
      const result = rankEntries(input);
      expect(result).toHaveLength(1);
      expect(result[0].rank).toBe(1);
      expect(result[0].uid).toBe('user1');
      expect(result[0].xp).toBe(500);
    });
  });

  describe('distinct XP values (no ties)', () => {
    it('sorts by XP descending and assigns sequential ranks', () => {
      const input: RankInput[] = [
        { uid: 'c', xp: 100 },
        { uid: 'a', xp: 500 },
        { uid: 'b', xp: 300 },
      ];
      const result = rankEntries(input);

      expect(result[0]).toMatchObject({ uid: 'a', xp: 500, rank: 1 });
      expect(result[1]).toMatchObject({ uid: 'b', xp: 300, rank: 2 });
      expect(result[2]).toMatchObject({ uid: 'c', xp: 100, rank: 3 });
    });

    it('assigns contiguous ranks 1, 2, 3 when no ties exist', () => {
      const input: RankInput[] = [
        { uid: 'u1', xp: 1000 },
        { uid: 'u2', xp: 800 },
        { uid: 'u3', xp: 600 },
      ];
      const result = rankEntries(input);
      const ranks = result.map((e) => e.rank);
      expect(ranks).toEqual([1, 2, 3]);
    });
  });

  describe('tie handling — 1224 standard competition ranking', () => {
    it('gives tied entries the same rank', () => {
      const input: RankInput[] = [
        { uid: 'a', xp: 500 },
        { uid: 'b', xp: 500 },
        { uid: 'c', xp: 200 },
      ];
      const result = rankEntries(input);

      // Both 500-XP users share rank 1
      const rank1Entries = result.filter((e) => e.xp === 500);
      expect(rank1Entries).toHaveLength(2);
      expect(rank1Entries[0].rank).toBe(1);
      expect(rank1Entries[1].rank).toBe(1);

      // The 200-XP user gets rank 3 (skipping rank 2)
      const rank3Entry = result.find((e) => e.uid === 'c');
      expect(rank3Entry?.rank).toBe(3);
    });

    it('skips ranks correctly for multiple ties at the top', () => {
      const input: RankInput[] = [
        { uid: 'a', xp: 1000 },
        { uid: 'b', xp: 1000 },
        { uid: 'c', xp: 1000 },
        { uid: 'd', xp: 500 },
      ];
      const result = rankEntries(input);

      // Three-way tie at rank 1
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(1);
      expect(result[2].rank).toBe(1);
      // Next entry is rank 4 (3 entries occupied positions 1, 2, 3)
      expect(result[3].rank).toBe(4);
      expect(result[3].uid).toBe('d');
    });

    it('handles ties in the middle of the leaderboard', () => {
      const input: RankInput[] = [
        { uid: 'a', xp: 900 },
        { uid: 'b', xp: 500 },
        { uid: 'c', xp: 500 },
        { uid: 'd', xp: 100 },
      ];
      const result = rankEntries(input);

      expect(result[0]).toMatchObject({ uid: 'a', rank: 1 });
      expect(result[1].rank).toBe(2);
      expect(result[2].rank).toBe(2);
      expect(result[3]).toMatchObject({ uid: 'd', rank: 4 });
    });

    it('handles all entries having equal XP', () => {
      const input: RankInput[] = [
        { uid: 'a', xp: 200 },
        { uid: 'b', xp: 200 },
        { uid: 'c', xp: 200 },
      ];
      const result = rankEntries(input);
      // All share rank 1
      expect(result.every((e) => e.rank === 1)).toBe(true);
    });
  });

  describe('optional fields', () => {
    it('includes displayName when provided', () => {
      const input: RankInput[] = [{ uid: 'u1', xp: 300, displayName: 'Alice' }];
      const result = rankEntries(input);
      expect(result[0].displayName).toBe('Alice');
    });

    it('includes avatarUrl when provided', () => {
      const input: RankInput[] = [
        { uid: 'u1', xp: 300, avatarUrl: 'https://example.com/avatar.png' },
      ];
      const result = rankEntries(input);
      expect(result[0].avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('omits displayName key when not provided', () => {
      const input: RankInput[] = [{ uid: 'u1', xp: 300 }];
      const result = rankEntries(input);
      expect(Object.prototype.hasOwnProperty.call(result[0], 'displayName')).toBe(false);
    });

    it('omits avatarUrl key when not provided', () => {
      const input: RankInput[] = [{ uid: 'u1', xp: 300 }];
      const result = rankEntries(input);
      expect(Object.prototype.hasOwnProperty.call(result[0], 'avatarUrl')).toBe(false);
    });
  });

  describe('does not mutate input', () => {
    it('returns a new array', () => {
      const input: RankInput[] = [
        { uid: 'a', xp: 100 },
        { uid: 'b', xp: 200 },
      ];
      const original = [...input];
      rankEntries(input);
      // Input order should be unchanged
      expect(input[0].uid).toBe(original[0].uid);
      expect(input[1].uid).toBe(original[1].uid);
    });
  });

  describe('return type conforms to LeaderboardEntry schema', () => {
    it('result items have required LeaderboardEntry fields', () => {
      const input: RankInput[] = [{ uid: 'user42', xp: 1500, displayName: 'Bob' }];
      const result: LeaderboardEntry[] = rankEntries(input);
      expect(result[0]).toHaveProperty('uid', 'user42');
      expect(result[0]).toHaveProperty('xp', 1500);
      expect(result[0]).toHaveProperty('rank', 1);
      expect(result[0]).toHaveProperty('displayName', 'Bob');
    });
  });

  describe('zero XP entries', () => {
    it('handles zero XP entries correctly', () => {
      const input: RankInput[] = [
        { uid: 'a', xp: 100 },
        { uid: 'b', xp: 0 },
        { uid: 'c', xp: 0 },
      ];
      const result = rankEntries(input);

      expect(result[0]).toMatchObject({ uid: 'a', rank: 1, xp: 100 });
      expect(result[1].rank).toBe(2);
      expect(result[2].rank).toBe(2);
    });
  });
});
