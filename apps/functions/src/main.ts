import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  createAuditLogAdapter,
  createAuthAdapter,
  createDbAdapter,
  ensureApp,
} from './lib/adapters';
import { FunctionsDomainError } from './lib/errors';
import { inviteMemberCore } from './lib/invite-member.core';
import { syncMemberClaimsCore } from './lib/member-claims-sync.core';
import type { CorePorts } from './lib/ports';
import { provisionTenantCore } from './lib/provision-tenant.core';
import { setUserRoleCore } from './lib/set-user-role.core';

ensureApp();

const deps: CorePorts = {
  auth: createAuthAdapter(),
  db: createDbAdapter(),
  audit: createAuditLogAdapter(),
};

const CALLABLE_OPTS = { cors: true, region: 'us-central1' } as const;

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof FunctionsDomainError) {
    return new HttpsError(err.code, err.message);
  }
  console.error('Unhandled error in callable function', err);
  return new HttpsError('internal', 'Internal error');
}

/** Assign a role (custom claims) to a user. Superadmin or same-tenant tenant_admin only. */
export const setUserRole = onCall(CALLABLE_OPTS, async (request) => {
  try {
    return await setUserRoleCore(deps, request.auth?.token, request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
});

/** Invite a member into a tenant (creates the auth user if needed). */
export const inviteMember = onCall(CALLABLE_OPTS, async (request) => {
  try {
    return await inviteMemberCore(deps, request.auth?.token, request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
});

/** Provision a new tenant (superadmin only). */
export const provisionTenant = onCall(CALLABLE_OPTS, async (request) => {
  try {
    return await provisionTenantCore(deps, request.auth?.token, request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
});

/** Keep custom claims in sync with member docs (role changes, deactivation). */
export const onMemberWritten = onDocumentWritten(
  { document: 'tenants/{tenantId}/members/{uid}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.exists ? (event.data.before.data() ?? null) : null;
    const after = event.data?.after.exists ? (event.data.after.data() ?? null) : null;
    await syncMemberClaimsCore(deps, {
      tenantId: event.params.tenantId,
      uid: event.params.uid,
      before,
      after,
    });
  },
);
