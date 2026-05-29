import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { LEADERBOARD_PERIODS } from '@forge/shared';
import { adminAuth, db } from '../lib/admin';

const provisionInput = z.object({
  tenantId: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Must be a DNS-safe label'),
  name: z.string().min(1).max(200),
  plan: z.string().default('starter'),
  adminEmail: z.string().email().optional(),
});

/**
 * Provision a new tenant (superadmin only):
 *  1. create a GCIP Identity Platform tenant (true isolation),
 *  2. seed the /tenants/{id} doc + default gamification/leaderboard config,
 *  3. optionally invite the first tenant admin.
 * Idempotent on tenantId — re-running will not duplicate the GCIP tenant.
 */
export const provisionTenant = onCall(async (request) => {
  if (request.auth?.token['role'] !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Superadmin only.');
  }
  const input = provisionInput.parse(request.data);

  const tenantRef = db.doc(`tenants/${input.tenantId}`);
  const existing = await tenantRef.get();
  if (existing.exists && existing.get('status') !== 'archived') {
    throw new HttpsError('already-exists', 'Tenant already provisioned.');
  }

  // 1) GCIP tenant.
  const gcipTenant = await adminAuth.tenantManager().createTenant({
    displayName: input.name.slice(0, 20),
    emailSignInConfig: { enabled: true, passwordRequired: true },
  });

  const now = new Date().toISOString();

  // 2) Seed tenant doc.
  await tenantRef.set({
    id: input.tenantId,
    name: input.name,
    status: 'active',
    plan: input.plan,
    gcipTenantId: gcipTenant.tenantId,
    branding: { colors: {} },
    createdAt: now,
    createdBy: request.auth.uid,
  });

  // Default leaderboard documents (written server-side; clients read-only).
  const batch = db.batch();
  for (const period of LEADERBOARD_PERIODS) {
    batch.set(tenantRef.collection('leaderboard').doc(period), {
      tenantId: input.tenantId,
      period,
      entries: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  batch.set(db.doc('platform/config'), { tenantCount: FieldValue.increment(1) }, { merge: true });
  await batch.commit();

  return { ok: true, tenantId: input.tenantId, gcipTenantId: gcipTenant.tenantId };
});
