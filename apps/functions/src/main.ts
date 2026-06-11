import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import {
  createAuthAdapter,
  createDbAdapter,
  createStatementDbAdapter,
  ensureApp,
} from './lib/adapters';
import { FunctionsDomainError } from './lib/errors';
import { inviteMemberCore } from './lib/invite-member.core';
import { createGamificationDbAdapter } from './lib/adapters';
import { onEnrollmentWrittenCore } from './lib/on-enrollment-written.core';
import { onGameResultCreatedCore } from './lib/on-game-result-created.core';
import { createVerifyBadgeHandler } from './lib/verify-badge.core';
import {
  buildRebuildLeaderboardsCallable,
  buildRebuildLeaderboardsSchedule,
} from './lib/leaderboard.core';
import { syncMemberClaimsCore } from './lib/member-claims-sync.core';
import type { CorePorts } from './lib/ports';
import { provisionTenantCore } from './lib/provision-tenant.core';
import { recordStatementsCore } from './lib/record-statements.core';
import { setUserRoleCore } from './lib/set-user-role.core';

ensureApp();

const deps: CorePorts = {
  auth: createAuthAdapter(),
  db: createDbAdapter(),
};

const statementDeps = { db: createStatementDbAdapter() };
const gamificationDeps = { db: createGamificationDbAdapter() };

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

/** Persist a batch of tenant-scoped xAPI statements into the LRS store. */
export const recordStatements = onCall(CALLABLE_OPTS, async (request) => {
  try {
    return await recordStatementsCore(statementDeps, request.auth?.token, request.data);
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

/** Award XP/badges for lesson and course completions recorded on enrollments. */
export const onEnrollmentWritten = onDocumentWritten(
  { document: 'tenants/{tenantId}/courses/{courseId}/enrollments/{uid}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.exists ? (event.data.before.data() ?? null) : null;
    const after = event.data?.after.exists ? (event.data.after.data() ?? null) : null;
    await onEnrollmentWrittenCore(gamificationDeps, {
      tenantId: event.params.tenantId,
      courseId: event.params.courseId,
      uid: event.params.uid,
      before,
      after,
    });
  },
);

/** Award XP/badges for player-created game results and stamp xpAwarded back. */
export const onGameResultCreated = onDocumentCreated(
  { document: 'tenants/{tenantId}/gameResults/{resultId}', region: 'us-central1' },
  async (event) => {
    await onGameResultCreatedCore(gamificationDeps, {
      tenantId: event.params.tenantId,
      resultId: event.params.resultId,
      data: event.data?.data() ?? null,
    });
  },
);

/** Public Open Badges credential verification: GET /verifyBadge?tenant=&uid=&badge= */
export const verifyBadge = onRequest(
  { cors: true, region: 'us-central1' },
  createVerifyBadgeHandler(gamificationDeps),
);

/** Hourly leaderboard rebuild across all tenants (daily/weekly/allTime). */
export const rebuildLeaderboardsHourly = buildRebuildLeaderboardsSchedule();

/** On-demand rebuild: superadmin (explicit tenantId) or own-tenant authoring roles. */
export const rebuildLeaderboards = buildRebuildLeaderboardsCallable();
