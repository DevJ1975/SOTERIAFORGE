import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  type QuizResponse,
  XAPI_TENANT_EXTENSION,
  XAPI_VERBS,
  gradeQuiz,
  quiz as quizSchema,
} from '@assurance/shared';
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
  // Validate the stored quiz against the schema before grading — a malformed or
  // tampered quiz doc must not be graded silently (anti-cheat).
  const parsedQuiz = quizSchema.safeParse({ id: quizSnap.id, ...quizSnap.data() });
  if (!parsedQuiz.success) throw new HttpsError('failed-precondition', 'Quiz is malformed.');
  const quiz = parsedQuiz.data;
  const maxAttempts = quizSnap.get('maxAttempts') as number | undefined;

  const uid = caller.uid;
  const now = new Date().toISOString();
  const enrollRef = db.doc(
    `tenants/${input.tenantId}/courses/${input.courseId}/enrollments/${uid}`,
  );

  // Authoritative server-side grade (pure; no side effects).
  const grade = gradeQuiz(quiz, input.responses as QuizResponse[]);

  // Enforce attempts limit + record the attempt atomically so concurrent
  // submissions can't both read the same count and exceed `maxAttempts`.
  const usedAttempts = await db.runTransaction(async (tx) => {
    const enrollSnap = await tx.get(enrollRef);
    const attemptsMap = (enrollSnap.get('cmi.quizAttempts') as Record<string, number>) ?? {};
    const used = attemptsMap[input.quizId] ?? 0;
    if (maxAttempts !== undefined && used >= maxAttempts) {
      throw new HttpsError('resource-exhausted', 'No quiz attempts remaining.');
    }
    tx.set(
      enrollRef,
      {
        uid,
        courseId: input.courseId,
        tenantId: input.tenantId,
        score: grade.scorePct,
        lastActivityAt: now,
        updatedAt: now,
        cmi: {
          ...(enrollSnap.get('cmi') ?? {}),
          quizAttempts: { ...attemptsMap, [input.quizId]: used + 1 },
        },
      },
      { merge: true },
    );
    return used;
  });

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
