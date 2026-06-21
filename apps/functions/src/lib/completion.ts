import { db } from './admin';
import { computeMemberAward, upsertLeaderboards } from './gamification';

export interface CompletionResult {
  progressPct: number;
  completed: boolean;
  /** True only the first time this module is completed (rewards are granted once). */
  firstCompletion: boolean;
}

/**
 * Server-authoritative module completion shared by `completeModule` and
 * `submitQuiz`. Updates enrollment progress; on first completion grants the
 * module's XP (+ any `extraXp`) and module badges, plus course badges when the
 * course is now complete; updates the streak and leaderboards. Idempotent.
 *
 * The first-completion gate is **atomic**: the enrollment read, the
 * `firstCompletion` decision, the enrollment write, and the member XP/badge
 * award all run inside one `db.runTransaction`. Two concurrent calls for the
 * same module (e.g. `submitQuiz` racing `completeModule`, or a callable
 * auto-retry) therefore agree on exactly one `firstCompletion=true`, so member
 * XP/badges are granted once and the period leaderboards are upserted once —
 * previously the non-transactional read-modify-write double-counted both.
 *
 * Stable, non-enrollment data (module `xpReward`/`badgeRefs`, course
 * `badgeRefs`, `totalModules`) is read **before** the transaction since it does
 * not change during completion; only the enrollment + member docs are read and
 * written inside it.
 */
export async function recordModuleCompletion(opts: {
  tenantId: string;
  courseId: string;
  moduleId: string;
  uid: string;
  nowISO: string;
  extraXp?: number;
  score?: number;
}): Promise<CompletionResult> {
  const { tenantId, courseId, moduleId, uid, nowISO } = opts;

  // --- Pre-transaction reads (stable during completion) ---------------------
  const modSnap = await db.doc(`tenants/${tenantId}/courses/${courseId}/modules/${moduleId}`).get();
  const moduleXp = (modSnap.get('xpReward') as number) ?? 0;
  const moduleBadges = (modSnap.get('badgeRefs') as string[]) ?? [];

  const totalModules =
    (await db.collection(`tenants/${tenantId}/courses/${courseId}/modules`).get()).size || 1;

  const courseBadges =
    ((await db.doc(`tenants/${tenantId}/courses/${courseId}`).get()).get('badgeRefs') as
      | string[]
      | undefined) ?? [];

  const enrollRef = db.doc(`tenants/${tenantId}/courses/${courseId}/enrollments/${uid}`);
  const memberRef = db.doc(`tenants/${tenantId}/members/${uid}`);

  // --- Atomic gate: enrollment first-completion + member award --------------
  const outcome = await db.runTransaction(async (tx) => {
    const enrollSnap = await tx.get(enrollRef);
    const prev: string[] = (enrollSnap.get('cmi.completedModuleIds') as string[]) ?? [];
    const firstCompletion = !prev.includes(moduleId);

    const completedModuleIds = firstCompletion ? [...prev, moduleId] : prev;
    const progressPct = Math.round((completedModuleIds.length / totalModules) * 100);
    const completed = progressPct >= 100;

    // Member award must be read in the SAME transaction so it commits together
    // with the enrollment gate (read before any write per Firestore tx rules).
    let xpDelta = 0;
    let award: ReturnType<typeof computeMemberAward> | null = null;
    if (firstCompletion) {
      const badgeIds = [...moduleBadges, ...(completed ? courseBadges : [])];
      xpDelta = moduleXp + (opts.extraXp ?? 0);
      const memberSnap = await tx.get(memberRef);
      award = computeMemberAward(
        {
          xp: memberSnap.get('xp') as number | undefined,
          streakDays: memberSnap.get('streakDays') as number | undefined,
          lastActiveAt: memberSnap.get('lastActiveAt') as string | undefined,
          earnedBadgeIds: memberSnap.get('earnedBadgeIds') as string[] | undefined,
          displayName: memberSnap.get('displayName') as string | undefined,
          avatarUrl: memberSnap.get('avatarUrl') as string | undefined,
        },
        xpDelta,
        nowISO,
        badgeIds,
      );
    }

    tx.set(
      enrollRef,
      {
        uid,
        courseId,
        tenantId,
        progressPct,
        completed,
        lastActivityAt: nowISO,
        updatedAt: nowISO,
        ...(opts.score !== undefined ? { score: opts.score } : {}),
        cmi: { ...(enrollSnap.get('cmi') ?? {}), completedModuleIds },
      },
      { merge: true },
    );

    if (firstCompletion && award) {
      tx.set(memberRef, award.patch, { merge: true });
    }

    return {
      firstCompletion,
      progressPct,
      completed,
      xpDelta,
      newXp: award?.result.newXp ?? 0,
      displayName: award?.result.displayName,
      avatarUrl: award?.result.avatarUrl,
    };
  });

  // --- Post-transaction: period leaderboards (exactly once) -----------------
  // Done after commit so the (multi-doc) leaderboard transactions never race
  // inside the gate; it runs only on a genuine first completion with XP.
  if (outcome.firstCompletion && outcome.xpDelta > 0) {
    await upsertLeaderboards(
      tenantId,
      { uid, displayName: outcome.displayName, avatarUrl: outcome.avatarUrl },
      { xpDelta: outcome.xpDelta, newXp: outcome.newXp },
    );
  }

  return {
    progressPct: outcome.progressPct,
    completed: outcome.completed,
    firstCompletion: outcome.firstCompletion,
  };
}
