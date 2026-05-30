import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../lib/admin';
import { recordModuleCompletion } from '../lib/completion';

const input = z.object({
  tenantId: z.string(),
  courseId: z.string(),
  moduleId: z.string(),
  /** Optional score for scored content (video/scorm/game). */
  score: z.number().min(0).max(100).optional(),
});

/**
 * Server-authoritative module completion for non-quiz content (video, SCORM,
 * cmi5/Unity, game). The client reports completion; the server recomputes
 * progress and grants XP/badges/streak (idempotent, anti-cheat) — consistent
 * with submitQuiz.
 */
export const completeModule = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const { tenantId, courseId, moduleId, score } = input.parse(request.data);
  if (caller.token['role'] !== 'superadmin' && caller.token['tenantId'] !== tenantId) {
    throw new HttpsError('permission-denied', 'Tenant mismatch.');
  }

  const modSnap = await db.doc(`tenants/${tenantId}/courses/${courseId}/modules/${moduleId}`).get();
  if (!modSnap.exists) throw new HttpsError('not-found', 'Module not found.');

  const result = await recordModuleCompletion({
    tenantId,
    courseId,
    moduleId,
    uid: caller.uid,
    nowISO: new Date().toISOString(),
    score,
  });
  return { ok: true, ...result };
});
