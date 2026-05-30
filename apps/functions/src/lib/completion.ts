import { db } from './admin';
import { awardToMember, upsertLeaderboards } from './gamification';

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

  const modSnap = await db.doc(`tenants/${tenantId}/courses/${courseId}/modules/${moduleId}`).get();
  const moduleXp = (modSnap.get('xpReward') as number) ?? 0;
  const moduleBadges = (modSnap.get('badgeRefs') as string[]) ?? [];

  const totalModules =
    (await db.collection(`tenants/${tenantId}/courses/${courseId}/modules`).get()).size || 1;

  const enrollRef = db.doc(`tenants/${tenantId}/courses/${courseId}/enrollments/${uid}`);
  const enrollSnap = await enrollRef.get();
  const prev: string[] = (enrollSnap.get('cmi.completedModuleIds') as string[]) ?? [];
  const firstCompletion = !prev.includes(moduleId);

  const completedModuleIds = firstCompletion ? [...prev, moduleId] : prev;
  const progressPct = Math.round((completedModuleIds.length / totalModules) * 100);
  const completed = progressPct >= 100;

  await enrollRef.set(
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

  if (firstCompletion) {
    const badgeIds = [...moduleBadges];
    if (completed) {
      const courseBadges = (await db.doc(`tenants/${tenantId}/courses/${courseId}`).get()).get(
        'badgeRefs',
      ) as string[] | undefined;
      badgeIds.push(...(courseBadges ?? []));
    }
    const xpDelta = moduleXp + (opts.extraXp ?? 0);
    const award = await awardToMember({ tenantId, uid, xpDelta, nowISO, badgeIds });
    if (xpDelta > 0) {
      await upsertLeaderboards(tenantId, {
        uid,
        displayName: award.displayName,
        avatarUrl: award.avatarUrl,
        xp: award.newXp,
      });
    }
  }

  return { progressPct, completed, firstCompletion };
}
