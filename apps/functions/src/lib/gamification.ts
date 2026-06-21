import { levelFromXp, nextStreak } from '@assurance/shared';
import { db } from './admin';
import { applyLeaderboardEntry, type LeaderboardEntryData } from './leaderboard';

export interface AwardResult {
  newXp: number;
  newLevel: number;
  displayName?: string;
  avatarUrl?: string;
}

/** The member fields {@link computeMemberAward} reads from the current doc. */
export interface MemberAwardState {
  xp?: number;
  level?: number;
  streakDays?: number;
  lastActiveAt?: string;
  earnedBadgeIds?: string[];
  displayName?: string;
  avatarUrl?: string;
}

/** The member fields {@link computeMemberAward} writes back (merge), plus result. */
export interface MemberAwardUpdate {
  /** The `{merge:true}` patch to write onto the member doc. */
  patch: {
    xp: number;
    level: number;
    streakDays: number;
    lastActiveAt: string;
    earnedBadgeIds: string[];
    updatedAt: string;
  };
  result: AwardResult;
}

/**
 * Pure computation of a member's XP/streak/badge award from the current member
 * state. Extracted so the **single transaction** in `recordModuleCompletion`
 * (which must gate the award atomically with the enrollment first-completion
 * check) and the standalone {@link awardToMember} use identical logic — XP only
 * ever moves forward by `max(0, xpDelta)`, the streak advances via
 * {@link nextStreak}, and badges are unioned (idempotent).
 */
export function computeMemberAward(
  state: MemberAwardState,
  xpDelta: number,
  nowISO: string,
  badgeIds?: string[],
): MemberAwardUpdate {
  const curXp = state.xp ?? 0;
  const newXp = curXp + Math.max(0, xpDelta);
  const streak = nextStreak(state.lastActiveAt, nowISO, state.streakDays ?? 0);
  const earned = new Set<string>(state.earnedBadgeIds ?? []);
  (badgeIds ?? []).forEach((b) => earned.add(b));
  const newLevel = levelFromXp(newXp);
  return {
    patch: {
      xp: newXp,
      level: newLevel,
      streakDays: streak.streakDays,
      lastActiveAt: nowISO,
      earnedBadgeIds: [...earned],
      updatedAt: nowISO,
    },
    result: {
      newXp,
      newLevel,
      displayName: state.displayName,
      avatarUrl: state.avatarUrl,
    },
  };
}

/**
 * Transactionally apply an XP award + daily streak + badge grants to a member.
 * Server-authoritative — the single place gamification state changes, so XP and
 * badges cannot be forged by clients. Computation is shared with
 * `recordModuleCompletion` via {@link computeMemberAward}.
 */
export async function awardToMember(opts: {
  tenantId: string;
  uid: string;
  xpDelta: number;
  nowISO: string;
  badgeIds?: string[];
}): Promise<AwardResult> {
  const ref = db.doc(`tenants/${opts.tenantId}/members/${opts.uid}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { patch, result } = computeMemberAward(
      {
        xp: snap.get('xp') as number | undefined,
        streakDays: snap.get('streakDays') as number | undefined,
        lastActiveAt: snap.get('lastActiveAt') as string | undefined,
        earnedBadgeIds: snap.get('earnedBadgeIds') as string[] | undefined,
        displayName: snap.get('displayName') as string | undefined,
        avatarUrl: snap.get('avatarUrl') as string | undefined,
      },
      opts.xpDelta,
      opts.nowISO,
      opts.badgeIds,
    );
    tx.set(ref, patch, { merge: true });
    return result;
  });
}

/** The member identity written into every board entry. */
interface MemberEntry {
  uid: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Upsert a member's award into the denormalized daily/weekly/allTime boards.
 *
 * The **allTime** board mirrors the member's cumulative XP (`newXp`, mode
 * `'set'`). The **daily** and **weekly** boards instead *accumulate* only the
 * `xpDelta` earned this award (mode `'add'`), so after a scheduled reset clears
 * them to `[]` they grow from 0 and reflect *period* activity rather than
 * lifetime XP — previously all three boards stored the same cumulative XP and so
 * were always identical and never meaningfully reset (MO-13b).
 *
 * Each board is updated transactionally via the pure {@link applyLeaderboardEntry}
 * helper (sorts, ranks, truncates to the top 100).
 */
export async function upsertLeaderboards(
  tenantId: string,
  member: MemberEntry,
  award: { xpDelta: number; newXp: number },
): Promise<void> {
  const plan: ReadonlyArray<{ period: string; mode: 'set' | 'add'; value: number }> = [
    { period: 'daily', mode: 'add', value: award.xpDelta },
    { period: 'weekly', mode: 'add', value: award.xpDelta },
    { period: 'allTime', mode: 'set', value: award.newXp },
  ];

  await Promise.all(
    plan.map(({ period, mode, value }) =>
      db.runTransaction(async (tx) => {
        const ref = db.doc(`tenants/${tenantId}/leaderboard/${period}`);
        const snap = await tx.get(ref);
        const current = (snap.get('entries') as LeaderboardEntryData[] | undefined) ?? [];
        const ranked = applyLeaderboardEntry(current, member, mode, value);
        tx.set(
          ref,
          { tenantId, period, entries: ranked, updatedAt: new Date().toISOString() },
          { merge: true },
        );
      }),
    ),
  );
}

/** Resolve the badgeIds a course/module grants on completion. */
export async function badgeRefsFor(
  tenantId: string,
  courseId: string,
  moduleId?: string,
): Promise<string[]> {
  const ids = new Set<string>();
  const course = await db.doc(`tenants/${tenantId}/courses/${courseId}`).get();
  ((course.get('badgeRefs') as string[]) ?? []).forEach((b) => ids.add(b));
  if (moduleId) {
    const mod = await db.doc(`tenants/${tenantId}/courses/${courseId}/modules/${moduleId}`).get();
    ((mod.get('badgeRefs') as string[]) ?? []).forEach((b) => ids.add(b));
  }
  return [...ids];
}
