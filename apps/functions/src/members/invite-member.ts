import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { ROLES } from '@forge/shared';
import { adminAuth, db } from '../lib/admin';

const inviteInput = z.object({
  tenantId: z.string(),
  email: z.string().email(),
  role: z.enum(ROLES),
  displayName: z.string().optional(),
});

/**
 * Invite a member into a tenant (superadmin, or tenant_admin within own tenant).
 * Creates (or reuses) the user in the tenant's GCIP pool, stamps custom claims,
 * and writes the member doc with status `invited`. Returns a password-reset link
 * the caller can email as the set-password invitation.
 */
export const inviteMember = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

  const input = inviteInput.parse(request.data);
  const isSuper = caller.token['role'] === 'superadmin';
  const isOwnTenantAdmin =
    caller.token['role'] === 'tenant_admin' && caller.token['tenantId'] === input.tenantId;
  if (!isSuper && !isOwnTenantAdmin) {
    throw new HttpsError('permission-denied', 'Not allowed to invite into this tenant.');
  }
  if (input.role === 'superadmin') {
    throw new HttpsError('invalid-argument', 'Superadmin is not a tenant membership.');
  }

  const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
  if (!tenantSnap.exists) throw new HttpsError('not-found', 'Tenant does not exist.');
  const gcipTenantId = tenantSnap.get('gcipTenantId') as string | undefined;
  const authClient = gcipTenantId
    ? adminAuth.tenantManager().authForTenant(gcipTenantId)
    : adminAuth;

  // Create or reuse the user in the tenant pool.
  let uid: string;
  try {
    const existing = await authClient.getUserByEmail(input.email);
    uid = existing.uid;
  } catch {
    const created = await authClient.createUser({
      email: input.email,
      displayName: input.displayName,
      emailVerified: false,
    });
    uid = created.uid;
  }

  await authClient.setCustomUserClaims(uid, {
    role: input.role,
    tenantId: input.tenantId,
    entitlements: [],
    gcipTenantId,
  });

  const now = new Date().toISOString();
  await db.doc(`tenants/${input.tenantId}/members/${uid}`).set(
    {
      uid,
      tenantId: input.tenantId,
      role: input.role,
      status: 'invited',
      email: input.email,
      displayName: input.displayName,
      xp: 0,
      level: 1,
      streakDays: 0,
      createdAt: now,
      createdBy: caller.uid,
    },
    { merge: true },
  );

  const inviteLink = await authClient.generatePasswordResetLink(input.email);
  return { ok: true, uid, inviteLink };
});

const deactivateInput = z.object({ tenantId: z.string(), uid: z.string() });

/** Deactivate a member: disable their auth account + flip member status. */
export const deactivateMember = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const { tenantId, uid } = deactivateInput.parse(request.data);

  const isSuper = caller.token['role'] === 'superadmin';
  const isOwnTenantAdmin =
    caller.token['role'] === 'tenant_admin' && caller.token['tenantId'] === tenantId;
  if (!isSuper && !isOwnTenantAdmin) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }

  const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
  const gcipTenantId = tenantSnap.get('gcipTenantId') as string | undefined;
  const authClient = gcipTenantId
    ? adminAuth.tenantManager().authForTenant(gcipTenantId)
    : adminAuth;

  await authClient.updateUser(uid, { disabled: true });
  await db
    .doc(`tenants/${tenantId}/members/${uid}`)
    .set(
      { status: 'deactivated', updatedAt: new Date().toISOString(), updatedBy: caller.uid },
      { merge: true },
    );
  return { ok: true };
});
