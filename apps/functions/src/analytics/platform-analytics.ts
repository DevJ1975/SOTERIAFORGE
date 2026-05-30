import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';

/**
 * Cross-tenant platform analytics for the superadmin console. Firestore rules
 * forbid client cross-tenant reads, so this aggregation runs server-side with
 * the Admin SDK. Returns per-tenant + platform totals.
 */
export const platformAnalytics = onCall(async (request) => {
  if (request.auth?.token['role'] !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Superadmin only.');
  }

  const tenantsSnap = await db.collection('tenants').get();

  const perTenant = await Promise.all(
    tenantsSnap.docs.map(async (t) => {
      const tenantId = t.id;
      const [members, enrollments] = await Promise.all([
        t.ref.collection('members').count().get(),
        db.collectionGroup('enrollments').where('tenantId', '==', tenantId).count().get(),
      ]);
      const completed = await db
        .collectionGroup('enrollments')
        .where('tenantId', '==', tenantId)
        .where('completed', '==', true)
        .count()
        .get();
      return {
        tenantId,
        name: (t.get('name') as string) ?? tenantId,
        status: (t.get('status') as string) ?? 'unknown',
        plan: (t.get('plan') as string) ?? 'starter',
        members: members.data().count,
        enrollments: enrollments.data().count,
        completions: completed.data().count,
      };
    }),
  );

  const totals = perTenant.reduce(
    (acc, t) => ({
      tenants: acc.tenants + 1,
      members: acc.members + t.members,
      enrollments: acc.enrollments + t.enrollments,
      completions: acc.completions + t.completions,
    }),
    { tenants: 0, members: 0, enrollments: 0, completions: 0 },
  );

  return { totals, tenants: perTenant, generatedAt: new Date().toISOString() };
});
