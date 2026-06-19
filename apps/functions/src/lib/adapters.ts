import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AuditLogPort } from './audit-log';
import type { AuthPort, DbPort } from './ports';

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

/** AuthPort over firebase-admin/auth. */
export function createAuthAdapter(): AuthPort {
  return {
    async setCustomClaims(uid, claims) {
      await auth().setCustomUserClaims(uid, claims);
    },

    async getUserByEmail(email) {
      try {
        const user = await auth().getUserByEmail(email);
        return { uid: user.uid };
      } catch (err) {
        if ((err as { code?: string } | null)?.code === 'auth/user-not-found') {
          return null;
        }
        throw err;
      }
    },

    async createUser(opts) {
      const user = await auth().createUser({
        email: opts.email,
        ...(opts.displayName ? { displayName: opts.displayName } : {}),
      });
      return { uid: user.uid };
    },

    async createGcipTenant(displayName) {
      try {
        const created = await auth().tenantManager().createTenant({ displayName });
        return { tenantId: created.tenantId };
      } catch {
        // Identity Platform not enabled / unavailable on this project.
        return null;
      }
    },
  };
}

/** DbPort over firebase-admin/firestore. */
export function createDbAdapter(): DbPort {
  return {
    async getTenant(tenantId) {
      const snap = await tenantRef(tenantId).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setTenant(tenantId, data) {
      await tenantRef(tenantId).set(data, { merge: true });
    },

    async getMember(tenantId, uid) {
      const snap = await memberRef(tenantId, uid).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setMember(tenantId, uid, data) {
      await memberRef(tenantId, uid).set(data, { merge: true });
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
