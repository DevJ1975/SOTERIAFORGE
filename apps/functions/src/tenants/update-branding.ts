import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../lib/admin';

const brandingInput = z.object({
  tenantId: z.string(),
  branding: z.object({
    logoUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
    colors: z.record(z.string(), z.string()).default({}),
    fontFamily: z.string().optional(),
    emailFromName: z.string().optional(),
  }),
});

/**
 * Update a tenant's white-label branding. Superadmin, or a tenant_admin acting
 * within their own tenant. Tenant docs are otherwise not client-writable, so
 * branding edits flow through here.
 */
export const updateBranding = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

  const { tenantId, branding } = brandingInput.parse(request.data);
  const isSuper = caller.token['role'] === 'superadmin';
  const isOwnTenantAdmin =
    caller.token['role'] === 'tenant_admin' && caller.token['tenantId'] === tenantId;
  if (!isSuper && !isOwnTenantAdmin) {
    throw new HttpsError('permission-denied', 'Not allowed to brand this tenant.');
  }

  await db.doc(`tenants/${tenantId}`).set(
    { branding, updatedAt: new Date().toISOString(), updatedBy: caller.uid },
    { merge: true },
  );
  return { ok: true };
});
