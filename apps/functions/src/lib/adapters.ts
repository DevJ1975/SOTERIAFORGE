import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import type {
  AuthPort,
  CommerceDbPort,
  DbPort,
  GamificationDbPort,
  StatementDbPort,
  StripePort,
} from './ports';

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

    async getUser(uid) {
      try {
        const user = await auth().getUser(uid);
        return user.customClaims ? { customClaims: user.customClaims } : {};
      } catch (err) {
        if ((err as { code?: string } | null)?.code === 'auth/user-not-found') {
          return null;
        }
        throw err;
      }
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

/** GamificationDbPort over firebase-admin/firestore. */
export function createGamificationDbAdapter(): GamificationDbPort {
  return {
    async getMember(tenantId, uid) {
      const snap = await memberRef(tenantId, uid).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setMember(tenantId, uid, data) {
      await memberRef(tenantId, uid).set(data, { merge: true });
    },

    async getXpEvent(tenantId, uid, eventId) {
      const snap = await memberRef(tenantId, uid).collection('xpEvents').doc(eventId).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async addXpEvent(tenantId, uid, eventId, doc) {
      await memberRef(tenantId, uid).collection('xpEvents').doc(eventId).set(doc);
    },

    async getAward(tenantId, uid, badgeId) {
      const snap = await memberRef(tenantId, uid).collection('awards').doc(badgeId).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setAward(tenantId, uid, badgeId, doc) {
      await memberRef(tenantId, uid).collection('awards').doc(badgeId).set(doc);
    },

    async updateGameResult(tenantId, resultId, data) {
      await tenantRef(tenantId).collection('gameResults').doc(resultId).set(data, { merge: true });
    },
  };
}

/** StatementDbPort over firebase-admin/firestore (per-tenant LRS store). */
export function createStatementDbAdapter(): StatementDbPort {
  return {
    async saveStatement(tenantId, statementId, doc) {
      await tenantRef(tenantId).collection('xapiStatements').doc(statementId).set(doc);
    },
  };
}

// ---- B2C commerce (Phase 5) ----------------------------------------------------

/** The fixed singleton container documents (see CommerceDbPort docblock). */
const B2C_STORE_DOC_PATH = 'b2c/store';
const STRIPE_WEBHOOK_DOC_PATH = 'stripe/webhook';

function b2cProductRef(productId: string) {
  return db().doc(B2C_STORE_DOC_PATH).collection('catalog').doc(productId);
}

function b2cCustomerRef(uid: string) {
  return db().doc(B2C_STORE_DOC_PATH).collection('customers').doc(uid);
}

function stripeEventRef(eventId: string) {
  return db().doc(STRIPE_WEBHOOK_DOC_PATH).collection('events').doc(eventId);
}

/**
 * CommerceDbPort over firebase-admin/firestore. Every path here is
 * function-only: firestore.rules' deny-all default (and the explicit
 * customers `write: if false`) keeps clients out — the Admin SDK bypasses rules.
 */
export function createCommerceDbAdapter(): CommerceDbPort {
  return {
    async getProduct(productId) {
      const snap = await b2cProductRef(productId).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async getCustomer(uid) {
      const snap = await b2cCustomerRef(uid).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setCustomer(uid, doc) {
      await b2cCustomerRef(uid).set(doc, { merge: true });
    },

    async findCustomerByStripeId(stripeCustomerId) {
      const snapshot = await db()
        .doc(B2C_STORE_DOC_PATH)
        .collection('customers')
        .where('stripeCustomerId', '==', stripeCustomerId)
        .limit(1)
        .get();
      const doc = snapshot.docs[0];
      return doc ? { uid: doc.id, data: doc.data() as Record<string, unknown> } : null;
    },

    async listProductsByPriceId(stripePriceId) {
      const snapshot = await db()
        .doc(B2C_STORE_DOC_PATH)
        .collection('catalog')
        .where('stripePriceId', '==', stripePriceId)
        .get();
      return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
    },

    async getEventLog(eventId) {
      const snap = await stripeEventRef(eventId).get();
      return snap.exists ? ((snap.data() ?? null) as Record<string, unknown> | null) : null;
    },

    async setEventLog(eventId, doc) {
      await stripeEventRef(eventId).set(doc);
    },
  };
}

/**
 * StripePort over the stripe Node SDK.
 *
 * Secrets: the secret key comes from process.env['STRIPE_SECRET_KEY'] and the
 * webhook signing secret from process.env['STRIPE_WEBHOOK_SECRET']. In
 * production both are provisioned as Firebase Functions secrets (declared via
 * `secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']` on the wrappers);
 * in the emulators they are typically absent — the checkout core then runs in
 * emulated mode and this adapter is never invoked. The SDK client is built
 * lazily so merely constructing the adapter (e.g. at cold start without the
 * secret) never throws.
 */
export function createStripeAdapter(): StripePort {
  let client: Stripe | null = null;
  const stripe = (): Stripe => {
    if (!client) {
      const secretKey = process.env['STRIPE_SECRET_KEY'];
      if (!secretKey) {
        throw new Error('STRIPE_SECRET_KEY is not set (configure it as a Functions secret)');
      }
      client = new Stripe(secretKey);
    }
    return client;
  };

  return {
    async createCheckoutSession(opts) {
      const session = await stripe().checkout.sessions.create({
        mode: opts.mode,
        line_items: opts.lineItems.map((item) => ({ price: item.price, quantity: item.quantity })),
        client_reference_id: opts.clientReferenceId,
        metadata: opts.metadata,
        success_url: opts.successUrl,
        cancel_url: opts.cancelUrl,
        ...(opts.customerEmail ? { customer_email: opts.customerEmail } : {}),
      });
      return { id: session.id, url: session.url ?? '' };
    },

    constructWebhookEvent(rawBody, signature, secret) {
      const event = stripe().webhooks.constructEvent(rawBody, signature, secret);
      return {
        id: event.id,
        type: event.type,
        data: { object: event.data.object as unknown as Record<string, unknown> },
      };
    },
  };
}
