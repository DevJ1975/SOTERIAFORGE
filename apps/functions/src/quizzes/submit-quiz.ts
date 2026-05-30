import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { type QuizResponse, XAPI_TENANT_EXTENSION, XAPI_VERBS, gradeQuiz } from '@assurance/shared';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/admin';
import { recordModuleCompletion } from '../lib/completion';

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

/**
 * Authoritative quiz submission. The server loads the quiz and grades it — the
 * client's responses are the only input; score, XP, badges and leaderboard
 * standing are computed here so they cannot be forged (anti-cheat). Enforces
 * the quiz's `maxAttempts`. Returns the grade.
 */
export const submitQuiz = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

  const input = submitInput.parse(request.data);
  if (caller.token['role'] !== 'superadmin' && caller.token['tenantId'] !== input.tenantId) {
    throw new HttpsError('permission-denied', 'Tenant mismatch.');
  }

  const quizSnap = await db.doc(`tenants/${input.tenantId}/quizzes/${input.quizId}`).get();
  if (!quizSnap.exists) throw new HttpsError('not-found', 'Quiz not found.');
  const quiz = { id: quizSnap.id, ...quizSnap.data() } as Parameters<typeof gradeQuiz>[0];
  const maxAttempts = quizSnap.get('maxAttempts') as number | undefined;

  const uid = caller.uid;
  const now = new Date().toISOString();
  const enrollRef = db.doc(
    `tenants/${input.tenantId}/courses/${input.courseId}/enrollments/${uid}`,
  );

  // Enforce attempts limit (tracked per quiz on the enrollment).
  const enrollSnap = await enrollRef.get();
  const attemptsMap = (enrollSnap.get('cmi.quizAttempts') as Record<string, number>) ?? {};
  const usedAttempts = attemptsMap[input.quizId] ?? 0;
  if (maxAttempts !== undefined && usedAttempts >= maxAttempts) {
    throw new HttpsError('resource-exhausted', 'No quiz attempts remaining.');
  }

  // Authoritative server-side grade.
  const grade = gradeQuiz(quiz, input.responses as QuizResponse[]);

  // Record the attempt + score on the enrollment.
  await enrollRef.set(
    {
      uid,
      courseId: input.courseId,
      tenantId: input.tenantId,
      score: grade.scorePct,
      lastActivityAt: now,
      updatedAt: now,
      cmi: {
        ...(enrollSnap.get('cmi') ?? {}),
        quizAttempts: { ...attemptsMap, [input.quizId]: usedAttempts + 1 },
      },
    },
    { merge: true },
  );

  // On pass, complete the module (grants module XP + quiz XP + badges + streak +
  // leaderboard, idempotently) via the shared completion path.
  if (grade.passed) {
    await recordModuleCompletion({
      tenantId: input.tenantId,
      courseId: input.courseId,
      moduleId: input.moduleId,
      uid,
      nowISO: now,
      extraXp: grade.earnedPoints * XP_PER_POINT,
      score: grade.scorePct,
    });
  }

  // Authoritative xAPI statement (passed/failed) → LRS.
  await db.doc(`lrs/${randomUUID()}`).set({
    id: randomUUID(),
    tenantId: input.tenantId,
    actorUid: uid,
    actor: { objectType: 'Agent', account: { homePage: 'https://soteriaforge.com', name: uid } },
    verb: { id: grade.passed ? XAPI_VERBS.passed : XAPI_VERBS.failed },
    object: { objectType: 'Activity', id: `https://soteriaforge.com/xapi/quiz/${input.quizId}` },
    result: { success: grade.passed, score: { scaled: grade.scorePct / 100 } },
    context: { extensions: { [XAPI_TENANT_EXTENSION]: input.tenantId } },
    timestamp: now,
  });

  return {
    ...grade,
    attemptsUsed: usedAttempts + 1,
    attemptsRemaining:
      maxAttempts !== undefined ? Math.max(0, maxAttempts - usedAttempts - 1) : null,
  };
});
