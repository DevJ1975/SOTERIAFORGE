import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { progressEvent } from '@forge/shared';
import {
  applyEventToEnrollment,
  toProjection,
  type EnrollmentProjection,
} from './lib/aggregate-progress.core';
import {
  createAuditLogAdapter,
  createAuthAdapter,
  createDbAdapter,
  createRateLimitAdapter,
  ensureApp,
} from './lib/adapters';
import { FunctionsDomainError } from './lib/errors';
import { inviteMemberCore } from './lib/invite-member.core';
import { logger } from './lib/logger';
import { syncMemberClaimsCore } from './lib/member-claims-sync.core';
import type { CorePorts } from './lib/ports';
import { provisionTenantCore } from './lib/provision-tenant.core';
import { createRateLimit, type RateLimit } from './lib/rate-limit.core';
import { setUserRoleCore } from './lib/set-user-role.core';

ensureApp();

const deps: CorePorts = {
  auth: createAuthAdapter(),
  db: createDbAdapter(),
  audit: createAuditLogAdapter(),
};

/** Per-actor token bucket guarding the privileged callables (see rate-limit.core). */
const rateLimit: RateLimit = createRateLimit(createRateLimitAdapter());

/**
 * Shared options for the privileged callables.
 *
 * HONEST: `minInstances` (warm pool) and `enforceAppCheck` are *deploy-time*
 * controls — the Firebase emulator ignores warm pools and does not enforce App
 * Check, so their effect is only observable on a deployed project. They are set
 * here so production gets a warm floor (no cold-start storm at shift change),
 * bounded fan-out, per-instance concurrency, and verified App Check tokens.
 */
const CALLABLE_OPTS = {
  cors: true,
  region: 'us-central1',
  minInstances: 2,
  maxInstances: 50,
  concurrency: 40,
  memory: '256MiB',
  timeoutSeconds: 30,
  enforceAppCheck: true,
} as const;

/** Firestore-trigger instance caps: bounded fan-out so a write storm can't fork unbounded. */
const TRIGGER_OPTS = {
  region: 'us-central1',
  maxInstances: 50,
  memory: '256MiB',
  timeoutSeconds: 30,
} as const;

function toHttpsError(err: unknown, fn: string, actorUid?: string): HttpsError {
  if (err instanceof FunctionsDomainError) {
    return new HttpsError(err.code, err.message);
  }
  logger.error('Unhandled error in callable function', {
    function: fn,
    actorUid,
    outcome: 'error',
    err,
  });
  return new HttpsError('internal', 'Internal error');
}

/**
 * Run a callable core with a per-actor rate-limit gate, structured logging, and
 * domain→HttpsError mapping. Rate limiting lives here (before dispatch) rather
 * than inside each core: it is the least-invasive spot, keeps the pure cores and
 * their specs untouched, and applies uniformly. Unauthenticated callers skip the
 * limiter and fall through to the core's own authz (which denies them).
 */
async function runCallable<T>(
  fn: string,
  request: CallableRequest,
  core: () => Promise<T>,
): Promise<T> {
  const actorUid = request.auth?.uid;
  const start = Date.now();
  try {
    if (actorUid) await rateLimit.take(actorUid);
    const result = await core();
    logger.info('callable ok', {
      function: fn,
      actorUid,
      outcome: 'ok',
      latencyMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    if (err instanceof FunctionsDomainError && err.code === 'resource-exhausted') {
      logger.warn('callable rate-limited', { function: fn, actorUid, outcome: 'rate-limited' });
    }
    throw toHttpsError(err, fn, actorUid);
  }
}

/** Assign a role (custom claims) to a user. Superadmin or same-tenant tenant_admin only. */
export const setUserRole = onCall(CALLABLE_OPTS, (request) =>
  runCallable('setUserRole', request, () =>
    setUserRoleCore(deps, request.auth?.token, request.data),
  ),
);

/** Invite a member into a tenant (creates the auth user if needed). */
export const inviteMember = onCall(CALLABLE_OPTS, (request) =>
  runCallable('inviteMember', request, () =>
    inviteMemberCore(deps, request.auth?.token, request.data),
  ),
);

/** Provision a new tenant (superadmin only). */
export const provisionTenant = onCall(CALLABLE_OPTS, (request) =>
  runCallable('provisionTenant', request, () =>
    provisionTenantCore(deps, request.auth?.token, request.data),
  ),
);

/** Keep custom claims in sync with member docs (role changes, deactivation). */
export const onMemberWritten = onDocumentWritten(
  { document: 'tenants/{tenantId}/members/{uid}', ...TRIGGER_OPTS },
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

/**
 * Authoritative server-side progress fold. Each appended event projects onto the
 * enrollment doc under the monotonic `progressVersion` guard (see
 * aggregate-progress.core). This makes the server the source of truth; the
 * client's optimistic apply is a UX accelerant. Idempotent: replays and
 * out-of-order arrivals converge.
 */
export const onProgressEventWritten = onDocumentWritten(
  {
    document: 'tenants/{tenantId}/courses/{courseId}/enrollments/{uid}/events/{eventId}',
    ...TRIGGER_OPTS,
  },
  async (event) => {
    const after = event.data?.after.exists ? (event.data.after.data() ?? null) : null;
    // Only newly-written/updated events advance the projection; deletions are no-ops.
    if (!after) return;

    const parsed = progressEvent.safeParse(after);
    if (!parsed.success) {
      logger.warn('Skipping malformed progress event', {
        function: 'onProgressEventWritten',
        tenantId: event.params.tenantId,
        outcome: 'ignored',
        eventId: event.params.eventId,
      });
      return;
    }
    const evt = parsed.data;

    let outcome = 'ignored';
    await deps.db.runEnrollmentTransaction(
      { tenantId: evt.tenantId, courseId: evt.courseId, uid: evt.uid },
      (current): Partial<EnrollmentProjection> | null => {
        const result = applyEventToEnrollment(toProjection(current), evt);
        outcome = result.outcome;
        return result.outcome === 'applied' ? result.next : null;
      },
    );

    logger.info('progress event folded', {
      function: 'onProgressEventWritten',
      actorUid: evt.uid,
      tenantId: evt.tenantId,
      outcome,
      clientSeq: evt.clientSeq,
      eventId: evt.idempotencyKey,
    });
  },
);
