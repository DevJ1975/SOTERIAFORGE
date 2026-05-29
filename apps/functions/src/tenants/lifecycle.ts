import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, db } from '../lib/admin';

const setStatusInput = z.object({
  tenantId: z.string(),
  status: z.enum(['active', 'suspended', 'archived']),
});

/**
 * Suspend / resume / archive a tenant (superadmin only). Suspension disables
 * the tenant's GCIP sign-in and flips status — data is hidden, never deleted.
 * Resume re-enables sign-in. Archive is the soft-delete state.
 */
export const setTenantStatus = onCall(async (request) => {
  if (request.auth?.token['role'] !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Superadmin only.');
  }
  const { tenantId, status } = setStatusInput.parse(request.data);

  const tenantRef = db.doc(`tenants/${tenantId}`);
  const snap = await tenantRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Tenant does not exist.');

  const gcipTenantId = snap.get('gcipTenantId') as string | undefined;
  if (gcipTenantId) {
    // Enable/disable email sign-in for the tenant pool.
    await adminAuth.tenantManager().updateTenant(gcipTenantId, {
      emailSignInConfig: { enabled: status === 'active', passwordRequired: true },
    });
  }

  await tenantRef.set(
    { status, updatedAt: new Date().toISOString(), updatedBy: request.auth.uid },
    { merge: true },
  );

  return { ok: true, tenantId, status };
});
