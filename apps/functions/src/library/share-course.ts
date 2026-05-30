import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/admin';
import { auditLog } from '../lib/audit';

const input = z.object({
  libraryCourseId: z.string(),
  tenantIds: z.array(z.string()).min(1).max(200),
});

/**
 * Copy a global-library course (and its modules) into one or more tenants.
 * Superadmin only. Each tenant gets a fresh course (new ids) with
 * `sourceLibraryId` set so re-shares can be tracked. Published as draft so the
 * tenant admin reviews before publishing.
 */
export const shareLibraryCourse = onCall(async (request) => {
  if (request.auth?.token['role'] !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Superadmin only.');
  }
  const { libraryCourseId, tenantIds } = input.parse(request.data);

  const libCourseSnap = await db.doc(`library/${libraryCourseId}`).get();
  if (!libCourseSnap.exists) throw new HttpsError('not-found', 'Library course not found.');
  const libCourse = libCourseSnap.data() as Record<string, unknown>;
  const libModules = (await db.collection(`library/${libraryCourseId}/modules`).get()).docs;

  const now = new Date().toISOString();
  const created: Array<{ tenantId: string; courseId: string }> = [];

  for (const tenantId of tenantIds) {
    const newCourseId = randomUUID();
    const batch = db.batch();
    batch.set(db.doc(`tenants/${tenantId}/courses/${newCourseId}`), {
      ...libCourse,
      id: newCourseId,
      tenantId,
      status: 'draft',
      sourceLibraryId: libraryCourseId,
      createdAt: now,
      updatedAt: now,
      createdBy: request.auth.uid,
    });
    libModules.forEach((m, i) => {
      const newModuleId = randomUUID();
      batch.set(db.doc(`tenants/${tenantId}/courses/${newCourseId}/modules/${newModuleId}`), {
        ...(m.data() as Record<string, unknown>),
        id: newModuleId,
        courseId: newCourseId,
        tenantId,
        order: i,
        createdAt: now,
      });
    });
    await batch.commit();
    created.push({ tenantId, courseId: newCourseId });
  }

  await auditLog({
    action: 'library.share',
    actorUid: request.auth.uid,
    targetId: libraryCourseId,
    details: { tenantIds, count: created.length },
  });

  return { ok: true, created };
});
