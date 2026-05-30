import { levelFromXp, nextStreak } from '@forge/shared';
import { db } from './admin';

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

interface Entry {
  uid: string;
  displayName?: string;
  avatarUrl?: string;
  xp: number;
}

/** Upsert a member's entry into the denormalized daily/weekly/allTime boards. */
export async function upsertLeaderboards(tenantId: string, entry: Entry): Promise<void> {
  await Promise.all(
    ['daily', 'weekly', 'allTime'].map((period) =>
      db.runTransaction(async (tx) => {
        const ref = db.doc(`tenants/${tenantId}/leaderboard/${period}`);
        const snap = await tx.get(ref);
        const entries: Entry[] = ((snap.get('entries') as Entry[]) ?? []).filter(
          (e) => e.uid !== entry.uid,
        );
        entries.push(entry);
        entries.sort((a, b) => b.xp - a.xp);
        const ranked = entries.slice(0, 100).map((e, i) => ({ ...e, rank: i + 1 }));
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
