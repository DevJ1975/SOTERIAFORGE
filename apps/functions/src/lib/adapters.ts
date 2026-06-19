import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AuditLogPort } from './audit-log';
import type { BucketState } from './rate-limit.core';
import type { EnrollmentProjection } from './aggregate-progress.core';
import type { AuthPort, DbPort, EnrollmentRef, RateLimitPort } from './ports';
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
