import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../lib/admin';
import { auditLog } from '../lib/audit';

const input = z.object({
  tenantId: z.string(),
  courseId: z.string(),
  uids: z.array(z.string()).min(1).max(500),
  dueAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Assign a course to learners by creating their enrollments. Firestore rules
 * only allow a user to create their OWN enrollment, so admin/instructor-driven
 * assignment must go server-side. Author roles only, within their tenant.
 * Existing enrollments are left intact (assignment never resets progress).
 */
export const assignCourse = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const { tenantId, courseId, uids, dueAt } = input.parse(request.data);

  const role = caller.token['role'];
  const canAuthor =
    role === 'superadmin' ||
    ((role === 'tenant_admin' || role === 'instructor') && caller.token['tenantId'] === tenantId);
  if (!canAuthor)
    throw new HttpsError('permission-denied', 'Not allowed to assign in this tenant.');

  const course = await db.doc(`tenants/${tenantId}/courses/${courseId}`).get();
  if (!course.exists) throw new HttpsError('not-found', 'Course not found.');

  const now = new Date().toISOString();
  let assigned = 0;
  let skipped = 0;

  // Batch in chunks of 400 (well under the 500-op cap).
  for (let i = 0; i < uids.length; i += 400) {
    const batch = db.batch();
    const slice = uids.slice(i, i + 400);
    const existing = await Promise.all(
      slice.map((uid) =>
        db.doc(`tenants/${tenantId}/courses/${courseId}/enrollments/${uid}`).get(),
      ),
    );
    slice.forEach((uid, j) => {
      if (existing[j].exists) {
        skipped++;
        return;
      }
      batch.set(db.doc(`tenants/${tenantId}/courses/${courseId}/enrollments/${uid}`), {
        uid,
        courseId,
        tenantId,
        progressPct: 0,
        completed: false,
        assigned: true,
        assignedBy: caller.uid,
        assignedAt: now,
        ...(dueAt ? { dueAt } : {}),
        createdAt: now,
        updatedAt: now,
      });
      assigned++;
    });
    await batch.commit();
  }

  await auditLog({
    action: 'course.assign',
    actorUid: caller.uid,
    tenantId,
    targetId: courseId,
    details: { assigned, skipped, count: uids.length },
  });

  return { ok: true, assigned, skipped };
});
