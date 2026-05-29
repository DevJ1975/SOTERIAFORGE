import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { ROLES } from '@forge/shared';
import { adminAuth, db } from '../lib/admin';

const setRoleInput = z.object({
  tenantId: z.string(),
  uid: z.string(),
  role: z.enum(ROLES),
});

/**
 * Set a member's role + tenant custom claims. Caller must be superadmin, or a
 * tenant_admin acting within their own tenant (and may not mint superadmins).
 * Claims are set against the tenant's GCIP pool when one is configured.
 */
export const setMemberRole = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

  const input = setRoleInput.parse(request.data);
  const callerRole = caller.token['role'];
  const callerTenant = caller.token['tenantId'];

  const isSuper = callerRole === 'superadmin';
  const isOwnTenantAdmin = callerRole === 'tenant_admin' && callerTenant === input.tenantId;
  if (!isSuper && !isOwnTenantAdmin) {
    throw new HttpsError('permission-denied', 'Not allowed to assign roles in this tenant.');
  }
  if (input.role === 'superadmin' && !isSuper) {
    throw new HttpsError('permission-denied', 'Only a superadmin may grant superadmin.');
  }

  const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
  if (!tenantSnap.exists) throw new HttpsError('not-found', 'Tenant does not exist.');
  const gcipTenantId = tenantSnap.get('gcipTenantId') as string | undefined;

  const claims = {
    role: input.role,
    tenantId: input.role === 'superadmin' ? undefined : input.tenantId,
    entitlements: [],
    gcipTenantId,
  };

  const authClient = gcipTenantId
    ? adminAuth.tenantManager().authForTenant(gcipTenantId)
    : adminAuth;

  await authClient.setCustomUserClaims(input.uid, claims);
  await db.doc(`tenants/${input.tenantId}/members/${input.uid}`).set(
    {
      uid: input.uid,
      tenantId: input.tenantId,
      role: input.role,
      status: 'active',
      updatedAt: new Date().toISOString(),
      updatedBy: caller.uid,
    },
    { merge: true },
  );

  return { ok: true };
});
