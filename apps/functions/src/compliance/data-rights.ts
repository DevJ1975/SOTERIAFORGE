import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, db } from '../lib/admin';
import { auditLog } from '../lib/audit';

const exportInput = z.object({ tenantId: z.string(), uid: z.string().optional() });

function assertCanActOn(
  caller: { uid: string; token: Record<string, unknown> },
  tenantId: string,
  targetUid: string,
) {
  const role = caller.token['role'];
  const isSuper = role === 'superadmin';
  const isOwnTenantAdmin = role === 'tenant_admin' && caller.token['tenantId'] === tenantId;
  const isSelf = caller.uid === targetUid;
  if (!isSuper && !isOwnTenantAdmin && !isSelf) {
    throw new HttpsError('permission-denied', 'Not allowed to act on this subject.');
  }
}

/**
 * GDPR/CCPA data export (data portability). Returns the subject's data across
 * the tenant: member profile, enrollments, AI conversations, and B2C customer
 * record. Self, tenant_admin (own tenant), or superadmin.
 */
export const exportUserData = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const { tenantId, uid: target } = exportInput.parse(request.data);
  const uid = target ?? caller.uid;
  assertCanActOn(caller, tenantId, uid);

  const member = (await db.doc(`tenants/${tenantId}/members/${uid}`).get()).data() ?? null;

  const enrollments = (await db.collectionGroup('enrollments').where('uid', '==', uid).get()).docs
    .filter((d) => d.ref.path.startsWith(`tenants/${tenantId}/`))
    .map((d) => ({ path: d.ref.path, ...d.data() }));

  const conversationsSnap = await db
    .collection(`tenants/${tenantId}/conversations/${uid}/messages`)
    .get();
  const conversations = conversationsSnap.docs.map((d) => d.data());

  const customer = (await db.doc(`customers/${uid}`).get()).data() ?? null;

  await auditLog({ action: 'data.export', actorUid: caller.uid, tenantId, targetId: uid });

  return {
    tenantId,
    uid,
    member,
    enrollments,
    conversations,
    customer,
    exportedAt: new Date().toISOString(),
  };
});

const deleteInput = z.object({
  tenantId: z.string(),
  uid: z.string(),
  /** Must be explicitly true — irreversible erasure of PII. */
  confirm: z.literal(true),
});

/**
 * GDPR/CCPA right-to-erasure. Superadmin only, requires explicit confirm.
 * Anonymizes PII on the member doc, deletes AI conversations, and disables the
 * auth account — preserving non-identifying aggregates (xp, completion counts)
 * needed for tenant analytics integrity. Full account deletion from GCIP is an
 * operator runbook step (logged here).
 */
export const deleteUserData = onCall(async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');
  if (caller.token['role'] !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Superadmin only.');
  }
  const { tenantId, uid } = deleteInput.parse(request.data);

  const memberRef = db.doc(`tenants/${tenantId}/members/${uid}`);
  await memberRef.set(
    {
      email: `redacted+${uid}@deleted.invalid`,
      displayName: 'Deleted user',
      avatarUrl: null,
      status: 'deactivated',
      piiErasedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  // Delete AI conversation history (free-text, potentially identifying).
  const msgs = await db.collection(`tenants/${tenantId}/conversations/${uid}/messages`).get();
  const batch = db.batch();
  msgs.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  // Disable the auth account in the tenant's GCIP pool.
  const gcipTenantId = (await db.doc(`tenants/${tenantId}`).get()).get('gcipTenantId') as
    | string
    | undefined;
  const authClient = gcipTenantId
    ? adminAuth.tenantManager().authForTenant(gcipTenantId)
    : adminAuth;
  try {
    await authClient.updateUser(uid, { disabled: true });
  } catch {
    // user may already be removed; non-fatal
  }

  await auditLog({ action: 'data.erasure', actorUid: caller.uid, tenantId, targetId: uid });
  return { ok: true, anonymized: true };
});
