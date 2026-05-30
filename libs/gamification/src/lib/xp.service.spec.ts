import { TestBed } from '@angular/core/testing';
import { Member } from '@forge/shared';
import { XpService } from './xp.service';

/**
 * Minimal valid Member for testing.
 * Required fields from libs/shared/src/lib/schemas/tenant.ts:
 *   uid, tenantId, role, status, email, createdAt
 * Optional with defaults: xp (0), level (1), streakDays (0), lastActiveAt (undefined)
 */
function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    uid: 'user-test-001',
    tenantId: 'tenant-abc',
    role: 'learner',
    status: 'active',
    email: 'test@example.com',
    xp: 0,
    level: 1,
    streakDays: 0,
    earnedBadgeIds: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('XpService', () => {
  let service: XpService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(XpService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('awardXp', () => {
    describe('XP accumulation', () => {
      it('adds XP to a member with 0 XP', () => {
        const member = makeMember({ xp: 0 });
        const result = service.awardXp(member, 100, '2024-03-15T10:00:00.000Z');
        expect(result.xp).toBe(100);
      });

      it('adds XP to a member with existing XP', () => {
        const member = makeMember({ xp: 250 });
        const result = service.awardXp(member, 50, '2024-03-15T10:00:00.000Z');
        expect(result.xp).toBe(300);
      });

      it('adds 0 XP (no-op for XP field)', () => {
        const member = makeMember({ xp: 100 });
        const result = service.awardXp(member, 0, '2024-03-15T10:00:00.000Z');
        expect(result.xp).toBe(100);
      });
    });

    describe('level computation', () => {
      it('stays at level 1 when XP is below level-2 threshold', () => {
        const member = makeMember({ xp: 0 });
        const result = service.awardXp(member, 100, '2024-03-15T10:00:00.000Z');
        // xpForLevel(2) = floor(100 * 2^1.5) = 282; total XP = 100 < 282
        expect(result.level).toBe(1);
      });

      it('advances to level 2 when XP crosses the threshold', () => {
        // xpForLevel(2) = 282; award enough to reach it
        const member = makeMember({ xp: 0 });
        const result = service.awardXp(member, 283, '2024-03-15T10:00:00.000Z');
        expect(result.level).toBe(2);
      });

      it('advances multiple levels in a single award', () => {
        // xpForLevel(4) = floor(100 * 4^1.5) = 800
        const member = makeMember({ xp: 0 });
        const result = service.awardXp(member, 800, '2024-03-15T10:00:00.000Z');
        expect(result.level).toBeGreaterThanOrEqual(4);
      });

      it('recomputes level correctly for member with existing XP', () => {
        // Member at xp=200 (still level 1, threshold2=282), award 83 → total 283 → level 2
        const member = makeMember({ xp: 200, level: 1 });
        const result = service.awardXp(member, 83, '2024-03-15T10:00:00.000Z');
        expect(result.xp).toBe(283);
        expect(result.level).toBe(2);
      });
    });

    describe('streak computation', () => {
      it('starts streak at 1 when member has no lastActiveAt', () => {
        const member = makeMember({ streakDays: 0, lastActiveAt: undefined });
        const result = service.awardXp(member, 50, '2024-03-15T10:00:00.000Z');
        expect(result.streakDays).toBe(1);
      });

      it('increments streak by 1 on consecutive day activity', () => {
        const member = makeMember({
          streakDays: 3,
          lastActiveAt: '2024-03-14T20:00:00.000Z',
        });
        const result = service.awardXp(member, 50, '2024-03-15T10:00:00.000Z');
        expect(result.streakDays).toBe(4);
      });

      it('does not change streak when called on the same UTC day', () => {
        const member = makeMember({
          streakDays: 5,
          lastActiveAt: '2024-03-15T08:00:00.000Z',
        });
        const result = service.awardXp(member, 50, '2024-03-15T22:00:00.000Z');
        expect(result.streakDays).toBe(5);
      });

      it('resets streak to 1 after a gap', () => {
        const member = makeMember({
          streakDays: 10,
          lastActiveAt: '2024-03-01T10:00:00.000Z',
        });
        const result = service.awardXp(member, 50, '2024-03-15T10:00:00.000Z');
        expect(result.streakDays).toBe(1);
      });
    });

    describe('lastActiveAt update', () => {
      it('sets lastActiveAt to nowISO', () => {
        const member = makeMember();
        const now = '2024-03-15T10:30:00.000Z';
        const result = service.awardXp(member, 50, now);
        expect(result.lastActiveAt).toBe(now);
      });

      it('updates lastActiveAt even when XP is 0', () => {
        const member = makeMember({ lastActiveAt: '2024-03-14T10:00:00.000Z' });
        const now = '2024-03-15T10:00:00.000Z';
        const result = service.awardXp(member, 0, now);
        expect(result.lastActiveAt).toBe(now);
      });
    });

    describe('updatedAt update', () => {
      it('sets updatedAt to nowISO', () => {
        const member = makeMember();
        const now = '2024-03-15T10:30:00.000Z';
        const result = service.awardXp(member, 50, now);
        expect(result.updatedAt).toBe(now);
      });
    });

    describe('immutability', () => {
      it('does not mutate the original member object', () => {
        const member = makeMember({ xp: 100, level: 1, streakDays: 2 });
        const originalXp = member.xp;
        const originalLevel = member.level;
        const originalStreak = member.streakDays;
        service.awardXp(member, 200, '2024-03-15T10:00:00.000Z');
        expect(member.xp).toBe(originalXp);
        expect(member.level).toBe(originalLevel);
        expect(member.streakDays).toBe(originalStreak);
      });

      it('returns a new object reference', () => {
        const member = makeMember();
        const result = service.awardXp(member, 50, '2024-03-15T10:00:00.000Z');
        expect(result).not.toBe(member);
      });

      it('preserves all other member fields unchanged', () => {
        const member = makeMember({
          uid: 'preserve-me',
          email: 'keep@example.com',
          displayName: 'Test User',
          role: 'instructor',
        });
        const result = service.awardXp(member, 50, '2024-03-15T10:00:00.000Z');
        expect(result.uid).toBe('preserve-me');
        expect(result.email).toBe('keep@example.com');
        expect(result.displayName).toBe('Test User');
        expect(result.role).toBe('instructor');
      });
    });

    describe('invalid inputs', () => {
      it('throws RangeError for negative XP amount', () => {
        const member = makeMember();
        expect(() => service.awardXp(member, -1, '2024-03-15T10:00:00.000Z')).toThrow(RangeError);
      });
    });
  });
});
