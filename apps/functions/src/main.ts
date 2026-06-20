import { createHmac, timingSafeEqual } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  HttpsError,
  onCall,
  onRequest,
  type CallableRequest,
  type Request,
} from 'firebase-functions/v2/https';
import type { Response } from 'express';
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
  createZoomAdapter,
  ensureApp,
} from './lib/adapters';
import { cancelLiveSessionCore } from './lib/cancel-live-session.core';
import { FunctionsDomainError } from './lib/errors';
import { getHostStartUrlCore } from './lib/get-host-start-url.core';
import { inviteMemberCore } from './lib/invite-member.core';
import { logger } from './lib/logger';
import { syncMemberClaimsCore } from './lib/member-claims-sync.core';
import type { CorePorts } from './lib/ports';
import { provisionTenantCore } from './lib/provision-tenant.core';
import { createRateLimit, type RateLimit } from './lib/rate-limit.core';
import { scheduleLiveSessionCore } from './lib/schedule-live-session.core';
import { setUserRoleCore } from './lib/set-user-role.core';

ensureApp();

const deps: CorePorts = {
  auth: createAuthAdapter(),
  db: createDbAdapter(),
  audit: createAuditLogAdapter(),
  // null when ZOOM_* secrets are absent (emulator/CI) → scheduleLiveSession
  // surfaces a graceful `unavailable`.
  zoom: createZoomAdapter() ?? undefined,
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

/**
 * Options for the public Zoom webhook. No `enforceAppCheck` — Zoom is not an
 * App Check client; the HMAC signature is the gate (verified in-handler).
 */
const HTTP_OPTS = {
  region: 'us-central1',
  maxInstances: 20,
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

/** Schedule a Zoom live session (host/admin in the caller's tenant). */
export const scheduleLiveSession = onCall(CALLABLE_OPTS, (request) =>
  runCallable('scheduleLiveSession', request, () =>
    scheduleLiveSessionCore(deps, request.auth?.token, request.data),
  ),
);

/** Cancel a live session (host/admin in the caller's tenant). */
export const cancelLiveSession = onCall(CALLABLE_OPTS, (request) =>
  runCallable('cancelLiveSession', request, () =>
    cancelLiveSessionCore(deps, request.auth?.token, request.data),
  ),
);

/** Return the sensitive host start URL from the private subdoc (host/admin). */
export const getHostStartUrl = onCall(CALLABLE_OPTS, (request) =>
  runCallable('getHostStartUrl', request, () =>
    getHostStartUrlCore(deps, request.auth?.token, request.data),
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

/**
 * Constant-time compare of two strings (avoids leaking the secret via timing).
 * Returns false on any length mismatch.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify Zoom's webhook HMAC signature. Zoom signs
 * `v0:{x-zm-request-timestamp}:{rawBody}` with the webhook secret token and sends
 * the result as `x-zm-signature: v0={hex}`. Returns false when the secret is
 * unset (fail closed) or the signature does not match.
 */
function verifyZoomSignature(req: Request): boolean {
  const secret = process.env['ZOOM_WEBHOOK_SECRET'];
  if (!secret) return false; // fail closed: no secret → reject everything.
  const signature = req.header('x-zm-signature');
  const timestamp = req.header('x-zm-request-timestamp');
  if (!signature || !timestamp) return false;

  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
  const message = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac('sha256', secret).update(message).digest('hex')}`;
  return safeEqual(signature, expected);
}

/**
 * Locate a live session by its Zoom meetingId across all tenants via a
 * collection-group query. Returns the matching doc reference, or null.
 */
async function findSessionByMeetingId(meetingId: string) {
  const snap = await getFirestore()
    .collectionGroup('liveSessions')
    .where('meetingId', '==', meetingId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].ref;
}

/**
 * Public Zoom webhook. HMAC-verifies every request (the signature is the gate —
 * no App Check, since Zoom is not an App Check client). Handles Zoom's
 * `endpoint.url_validation` challenge, then maps lifecycle events onto the
 * learner-readable session doc:
 *   - meeting.started   → status 'live'
 *   - meeting.ended     → status 'ended'
 *   - recording.completed → recordingUrl / recordingId
 */
export const zoomWebhook = onRequest(HTTP_OPTS, async (req: Request, res: Response) => {
  if (!verifyZoomSignature(req)) {
    logger.warn('Zoom webhook signature rejected', {
      function: 'zoomWebhook',
      outcome: 'denied',
    });
    res.status(401).send('invalid signature');
    return;
  }

  const body = (req.body ?? {}) as { event?: string; payload?: Record<string, unknown> };
  const event = body.event;
  const payload = (body.payload ?? {}) as Record<string, unknown>;

  // Zoom URL-validation handshake: echo back the plainToken + its HMAC.
  if (event === 'endpoint.url_validation') {
    const plainToken = String((payload as { plainToken?: unknown }).plainToken ?? '');
    const secret = process.env['ZOOM_WEBHOOK_SECRET'] ?? '';
    const encryptedToken = createHmac('sha256', secret).update(plainToken).digest('hex');
    res.status(200).json({ plainToken, encryptedToken });
    return;
  }

  const object = (payload['object'] ?? {}) as Record<string, unknown>;
  const meetingId =
    object['id'] !== undefined && object['id'] !== null ? String(object['id']) : undefined;
  if (!meetingId) {
    logger.warn('Zoom webhook missing meeting id', { function: 'zoomWebhook', outcome: 'ignored', event });
    res.status(200).send('ignored');
    return;
  }

  const ref = await findSessionByMeetingId(meetingId);
  if (!ref) {
    logger.info('Zoom webhook: no matching live session', {
      function: 'zoomWebhook',
      outcome: 'ignored',
      event,
    });
    res.status(200).send('no matching session');
    return;
  }

  const now = new Date().toISOString();
  let outcome = 'ignored';
  if (event === 'meeting.started') {
    await ref.set({ status: 'live', updatedAt: now }, { merge: true });
    outcome = 'live';
  } else if (event === 'meeting.ended') {
    await ref.set({ status: 'ended', updatedAt: now }, { merge: true });
    outcome = 'ended';
  } else if (event === 'recording.completed') {
    const files = Array.isArray(object['recording_files'])
      ? (object['recording_files'] as Array<Record<string, unknown>>)
      : [];
    const playable = files.find((f) => typeof f['play_url'] === 'string');
    const recordingUrl =
      (playable?.['play_url'] as string | undefined) ??
      (object['share_url'] as string | undefined);
    const recordingId = object['uuid'] !== undefined ? String(object['uuid']) : undefined;
    await ref.set(
      {
        ...(recordingUrl ? { recordingUrl } : {}),
        ...(recordingId ? { recordingId } : {}),
        updatedAt: now,
      },
      { merge: true },
    );
    outcome = 'recording';
  }

  logger.info('Zoom webhook handled', {
    function: 'zoomWebhook',
    outcome,
    event,
    meetingId,
  });
  res.status(200).send('ok');
});
