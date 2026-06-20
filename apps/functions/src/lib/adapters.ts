import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AuditLogPort } from './audit-log';
import type { BucketState } from './rate-limit.core';
import type { EnrollmentProjection } from './aggregate-progress.core';
import { logger } from './logger';
import type {
  AuthPort,
  CreateMeetingOptions,
  CreateMeetingResult,
  DbPort,
  EnrollmentRef,
  RateLimitPort,
  ZoomPort,
} from './ports';
import { withRetry } from './retry';

/** Module-level lazy admin app singleton. */
let app: App | null = null;

export function ensureApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp();
  }
  return app;
}

function auth(): Auth {
  return getAuth(ensureApp());
}

function db(): Firestore {
  return getFirestore(ensureApp());
}

function tenantRef(tenantId: string) {
  return db().collection('tenants').doc(tenantId);
}

function memberRef(tenantId: string, uid: string) {
  return tenantRef(tenantId).collection('members').doc(uid);
}

function enrollmentRef(ref: EnrollmentRef) {
  return tenantRef(ref.tenantId)
    .collection('courses')
    .doc(ref.courseId)
    .collection('enrollments')
    .doc(ref.uid);
}

function rateLimitRef(key: string) {
  return db().collection('rateLimits').doc(key);
}

function courseRef(tenantId: string, courseId: string) {
  return tenantRef(tenantId).collection('courses').doc(courseId);
}

function liveSessionRef(tenantId: string, id: string) {
  return tenantRef(tenantId).collection('liveSessions').doc(id);
}

function liveSessionPrivateRef(tenantId: string, id: string) {
  return liveSessionRef(tenantId, id).collection('private').doc('host');
}

/**
 * Conservative retry budget for downstream Admin SDK reads/writes that can fail
 * transiently (network blips, Firestore UNAVAILABLE/ABORTED). Total wall-clock
 * stays well under the 30s callable timeout: ≤3 attempts, ≤1.5s jittered cap.
 */
const RETRY_OPTS = { retries: 3, baseDelayMs: 100, maxDelayMs: 1500 } as const;

/** AuthPort over firebase-admin/auth. Transient failures are retried. */
export function createAuthAdapter(): AuthPort {
  return {
    async setCustomClaims(uid, claims) {
      await withRetry(() => auth().setCustomUserClaims(uid, claims), RETRY_OPTS);
    },

    async getUserByEmail(email) {
      try {
        const user = await withRetry(() => auth().getUserByEmail(email), RETRY_OPTS);
        return { uid: user.uid };
      } catch (err) {
        if ((err as { code?: string } | null)?.code === 'auth/user-not-found') {
          return null;
        }
        throw err;
      }
    },

    async createUser(opts) {
      const user = await withRetry(
        () =>
          auth().createUser({
            email: opts.email,
            ...(opts.displayName ? { displayName: opts.displayName } : {}),
          }),
        RETRY_OPTS,
      );
      return { uid: user.uid };
    },

    async createGcipTenant(displayName) {
      try {
        const created = await withRetry(
          () => auth().tenantManager().createTenant({ displayName }),
          RETRY_OPTS,
        );
        return { tenantId: created.tenantId };
      } catch {
        // Identity Platform not enabled / unavailable on this project.
        return null;
      }
    },
  };
}

/** DbPort over firebase-admin/firestore. Transient failures are retried. */
export function createDbAdapter(): DbPort {
  return {
    async getTenant(tenantId) {
      const snap = await withRetry(() => tenantRef(tenantId).get(), RETRY_OPTS);
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setTenant(tenantId, data) {
      await withRetry(() => tenantRef(tenantId).set(data, { merge: true }), RETRY_OPTS);
    },

    async getMember(tenantId, uid) {
      const snap = await withRetry(() => memberRef(tenantId, uid).get(), RETRY_OPTS);
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setMember(tenantId, uid, data) {
      await withRetry(() => memberRef(tenantId, uid).set(data, { merge: true }), RETRY_OPTS);
    },

    async getCourse(tenantId, courseId) {
      const snap = await withRetry(() => courseRef(tenantId, courseId).get(), RETRY_OPTS);
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async getLiveSession(tenantId, id) {
      const snap = await withRetry(() => liveSessionRef(tenantId, id).get(), RETRY_OPTS);
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setLiveSession(tenantId, id, data) {
      await withRetry(() => liveSessionRef(tenantId, id).set(data, { merge: true }), RETRY_OPTS);
    },

    async setLiveSessionPrivate(tenantId, id, data) {
      await withRetry(
        () => liveSessionPrivateRef(tenantId, id).set(data, { merge: true }),
        RETRY_OPTS,
      );
    },

    async getLiveSessionPrivate(tenantId, id) {
      const snap = await withRetry(() => liveSessionPrivateRef(tenantId, id).get(), RETRY_OPTS);
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async deleteLiveSession(tenantId, id) {
      // Best-effort drop of the private subdoc, then the main doc.
      await withRetry(() => liveSessionPrivateRef(tenantId, id).delete(), RETRY_OPTS);
      await withRetry(() => liveSessionRef(tenantId, id).delete(), RETRY_OPTS);
    },

    async runEnrollmentTransaction(ref, apply) {
      const docRef = enrollmentRef(ref);
      // Firestore runTransaction already retries on ABORTED contention; the
      // withRetry wraps the remaining transient transport failures.
      await withRetry(
        () =>
          db().runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            const current = snap.exists
              ? ((snap.data() ?? null) as Partial<EnrollmentProjection> | null)
              : null;
            const patch = apply(current);
            if (patch === null) return; // guard ignored the event → no write
            tx.set(docRef, patch, { merge: true });
          }),
        RETRY_OPTS,
      );
    },
  };
}

/** RateLimitPort over firebase-admin/firestore (`/rateLimits/{key}`). */
export function createRateLimitAdapter(): RateLimitPort {
  return {
    async runBucketTransaction(key, apply) {
      const docRef = rateLimitRef(key);
      await withRetry(
        () =>
          db().runTransaction(async (tx) => {
            const snap = await tx.get(docRef);
            const current = snap.exists ? ((snap.data() ?? null) as BucketState | null) : null;
            // `apply` throws when the bucket is empty → transaction aborts, no write.
            const next = apply(current);
            tx.set(docRef, next);
          }),
        RETRY_OPTS,
      );
    },
  };
}

/**
 * AuditLogPort over firebase-admin/firestore. Appends to the top-level
 * append-only `/auditLogs` collection with an auto-generated id. The Admin SDK
 * bypasses security rules, so the `write: if false` rule applies to clients
 * only — these writes succeed.
 */
export function createAuditLogAdapter(): AuditLogPort {
  return {
    async append(event) {
      await db().collection('auditLogs').add(event);
    },
  };
}

const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

interface ZoomCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Resolve the Server-to-Server OAuth credentials from the environment, or `null`
 * when ANY of them is missing.
 *
 * HONEST: the `ZOOM_*` values are *deploy-time* secrets bound via Secret Manager
 * (env on the deployed function). The emulator / CI / local dev never sets them,
 * so `createZoomAdapter()` returns `null` there and every test runs the mock
 * (`FakeZoomPort`). Real meeting creation/webhooks are therefore only exercised
 * against a deployed project — see docs/ZOOM_CONTRACTS.md "Honest not-run".
 */
function readZoomCredentials(): ZoomCredentials | null {
  const accountId = process.env['ZOOM_ACCOUNT_ID'];
  const clientId = process.env['ZOOM_CLIENT_ID'];
  const clientSecret = process.env['ZOOM_CLIENT_SECRET'];
  if (!accountId || !clientId || !clientSecret) return null;
  return { accountId, clientId, clientSecret };
}

/**
 * ZoomPort over the Zoom REST API using Server-to-Server OAuth.
 *
 * Returns `null` when Zoom is not configured (any of `ZOOM_ACCOUNT_ID`,
 * `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` absent) so the cores fall back to a
 * graceful `unavailable` and tests run the in-memory mock.
 */
export function createZoomAdapter(): ZoomPort | null {
  const creds = readZoomCredentials();
  if (!creds) return null;

  // Cached account access token (account_credentials grant). Refreshed shortly
  // before expiry; Zoom tokens live ~1h.
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 60_000) {
      return cachedToken.value;
    }
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
    const url = `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(
      creds.accountId,
    )}`;
    const res = await withRetry(
      () =>
        fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      RETRY_OPTS,
    );
    if (!res.ok) {
      throw new Error(`Zoom OAuth failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    const ttlMs = (body.expires_in ?? 3600) * 1000;
    cachedToken = { value: body.access_token, expiresAt: now + ttlMs };
    return body.access_token;
  }

  async function zoomFetch(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<Response> {
    const token = await accessToken();
    return withRetry(
      () =>
        fetch(`${ZOOM_API_BASE}${path}`, {
          method: init.method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        }),
      RETRY_OPTS,
    );
  }

  function mapCreateResponse(body: Record<string, unknown>): CreateMeetingResult {
    return {
      meetingId: String(body['id']),
      joinUrl: String(body['join_url'] ?? ''),
      startUrl: String(body['start_url'] ?? ''),
      ...(typeof body['password'] === 'string' && body['password'].length > 0
        ? { passcode: body['password'] }
        : {}),
    };
  }

  return {
    async createMeeting(opts: CreateMeetingOptions): Promise<CreateMeetingResult> {
      // Webinars go to the webinars endpoint (type 5 = scheduled webinar, paid
      // add-on); meetings to the meetings endpoint (type 2 = scheduled meeting).
      const isWebinar = opts.type === 'webinar';
      const path = isWebinar ? '/users/me/webinars' : '/users/me/meetings';
      const payload = {
        topic: opts.topic,
        type: isWebinar ? 5 : 2,
        start_time: opts.startTime,
        duration: opts.durationMin,
      };
      const res = await zoomFetch(path, { method: 'POST', body: payload });
      if (!res.ok) {
        throw new Error(`Zoom create ${opts.type} failed: ${res.status} ${res.statusText}`);
      }
      return mapCreateResponse((await res.json()) as Record<string, unknown>);
    },

    async getMeeting(meetingId: string): Promise<{ status: string } | null> {
      const res = await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`, { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Zoom get meeting failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { status?: string };
      return { status: String(body.status ?? 'unknown') };
    },

    async deleteMeeting(meetingId: string): Promise<void> {
      const res = await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`, {
        method: 'DELETE',
      });
      // 404 = already gone; treat as success (idempotent delete).
      if (!res.ok && res.status !== 404) {
        logger.warn('Zoom delete meeting returned non-OK', {
          function: 'createZoomAdapter.deleteMeeting',
          outcome: 'error',
          status: res.status,
        });
        throw new Error(`Zoom delete meeting failed: ${res.status} ${res.statusText}`);
      }
    },
  };
}
