import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { type QuizResponse, XAPI_TENANT_EXTENSION, XAPI_VERBS, gradeQuiz } from '@forge/shared';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/admin';

const submitInput = z.object({
  tenantId: z.string(),
  courseId: z.string(),
  moduleId: z.string(),
  quizId: z.string(),
  responses: z
    .array(
      z.object({
        questionId: z.string(),
        selectedOptionIds: z.array(z.string()).optional(),
        text: z.string().optional(),
        order: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});

/** XP awarded per correct point on a passing quiz. */
const XP_PER_POINT = 10;

/** Cumulative-curve level for a given XP total (mirrors @forge/gamification). */
function levelForXp(xp: number): number {
  let level = 1;
  while (100 * Math.pow(level + 1, 1.5) <= xp) level++;
  return level;
}

/**
 * Authoritative quiz submission. The server loads the quiz and grades it — the
 * client's responses are the only input; score, XP and leaderboard standing are
 * computed here so they cannot be forged (anti-cheat). Returns the grade.
 */
export const submitQuiz = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

  const input = submitInput.parse(request.data);
  const callerTenant = caller.token['tenantId'];
  if (caller.token['role'] !== 'superadmin' && callerTenant !== input.tenantId) {
    throw new HttpsError('permission-denied', 'Tenant mismatch.');
  }

  const quizSnap = await db.doc(`tenants/${input.tenantId}/quizzes/${input.quizId}`).get();
  if (!quizSnap.exists) throw new HttpsError('not-found', 'Quiz not found.');
  const quiz = { id: quizSnap.id, ...quizSnap.data() } as Parameters<typeof gradeQuiz>[0];

  // Authoritative server-side grade.
  const grade = gradeQuiz(quiz, input.responses as QuizResponse[]);
  const uid = caller.uid;
  const now = new Date().toISOString();
  const xpAward = grade.passed ? grade.earnedPoints * XP_PER_POINT : 0;

  // Update member XP/level transactionally; never trust a client-supplied score.
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  let newXp = 0;
  let displayName: string | undefined;
  let avatarUrl: string | undefined;
  await db.runTransaction(async (tx) => {
    const m = await tx.get(memberRef);
    const curXp = (m.get('xp') as number) ?? 0;
    newXp = curXp + xpAward;
    displayName = m.get('displayName') as string | undefined;
    avatarUrl = m.get('avatarUrl') as string | undefined;
    tx.set(
      memberRef,
      { xp: newXp, level: levelForXp(newXp), lastActiveAt: now, updatedAt: now },
      { merge: true },
    );
  });

  // Record the score + completion on the enrollment.
  await db.doc(`tenants/${input.tenantId}/courses/${input.courseId}/enrollments/${uid}`).set(
    {
      uid,
      courseId: input.courseId,
      tenantId: input.tenantId,
      score: grade.scorePct,
      lastActivityAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Update denormalized leaderboards (server-only write; anti-cheat).
  if (xpAward > 0) {
    await Promise.all(
      ['daily', 'weekly', 'allTime'].map((period) =>
        upsertLeaderboard(input.tenantId, period, { uid, displayName, avatarUrl, xp: newXp }),
      ),
    );
  }

  // Authoritative xAPI statement (passed/failed) → LRS.
  await db.doc(`lrs/${randomUUID()}`).set({
    id: randomUUID(),
    tenantId: input.tenantId,
    actorUid: uid,
    actor: { objectType: 'Agent', account: { homePage: 'https://soteriaforge.com', name: uid } },
    verb: { id: grade.passed ? XAPI_VERBS.passed : XAPI_VERBS.failed },
    object: {
      objectType: 'Activity',
      id: `https://soteriaforge.com/xapi/quiz/${input.quizId}`,
    },
    result: { success: grade.passed, score: { scaled: grade.scorePct / 100 } },
    context: { extensions: { [XAPI_TENANT_EXTENSION]: input.tenantId } },
    timestamp: now,
  });

  return grade;
});

interface Entry {
  uid: string;
  displayName?: string;
  avatarUrl?: string;
  xp: number;
}

async function upsertLeaderboard(tenantId: string, period: string, entry: Entry): Promise<void> {
  const ref = db.doc(`tenants/${tenantId}/leaderboard/${period}`);
  await db.runTransaction(async (tx) => {
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
  });
}
