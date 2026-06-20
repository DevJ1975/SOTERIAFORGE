import { levelFromXp, nextStreak } from '@assurance/shared';
import { db } from './admin';
import { applyLeaderboardEntry, type LeaderboardEntryData } from './leaderboard';

export interface AwardResult {
  newXp: number;
  newLevel: number;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Transactionally apply an XP award + daily streak + badge grants to a member.
 * Server-authoritative — the single place gamification state changes, so XP and
 * badges cannot be forged by clients.
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
    const curXp = (snap.get('xp') as number) ?? 0;
    const newXp = curXp + Math.max(0, opts.xpDelta);
    const streak = nextStreak(
      snap.get('lastActiveAt') as string | undefined,
      opts.nowISO,
      (snap.get('streakDays') as number) ?? 0,
    );
    const earned = new Set<string>((snap.get('earnedBadgeIds') as string[]) ?? []);
    (opts.badgeIds ?? []).forEach((b) => earned.add(b));

    const newLevel = levelFromXp(newXp);
    tx.set(
      ref,
      {
        xp: newXp,
        level: newLevel,
        streakDays: streak.streakDays,
        lastActiveAt: opts.nowISO,
        earnedBadgeIds: [...earned],
        updatedAt: opts.nowISO,
      },
      { merge: true },
    );
    return {
      newXp,
      newLevel,
      displayName: snap.get('displayName') as string | undefined,
      avatarUrl: snap.get('avatarUrl') as string | undefined,
    };
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
