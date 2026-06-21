import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { adminAuth, db } from '../lib/admin';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

/**
 * Stripe webhook. Entitlements are granted ONLY here, on a signature-verified
 * event, and are idempotent via the stripeEvents/{eventId} log. The client is
 * never trusted for payment state.
 */
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).send('Missing signature');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      res.status(400).send(`Webhook signature verification failed: ${(err as Error).message}`);
      return;
    }

    // Idempotency: atomically claim the event before doing any work. `create()`
    // fails if the doc already exists, so concurrent/retried deliveries of the
    // same event can never both pass this guard and double-grant.
    const eventRef = db.doc(`stripeEvents/${event.id}`);
    try {
      await eventRef.create({
        eventId: event.id,
        type: event.type,
        receivedAt: new Date().toISOString(),
      });
    } catch {
      res.status(200).send('Already processed');
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.client_reference_id ?? session.metadata?.['uid'];
      const productId = session.metadata?.['productId'];

      if (uid && productId) {
        await grantEntitlement(uid, productId, event.id, session);
      }
    } else if (event.type === 'customer.subscription.deleted') {
      // Subscription ended (cancellation/lapse) — revoke the entitlement it
      // granted so access doesn't persist after payment stops.
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      if (customerId) {
        await revokeSubscription(sub.id, customerId);
      }
    }

    await eventRef.set({ processedAt: new Date().toISOString() }, { merge: true });

    res.status(200).send('ok');
  },
);

/** Re-derive a user's custom claims from the canonical Firestore entitlements. */
async function syncEntitlementClaims(uid: string): Promise<void> {
  const snap = await db.doc(`customers/${uid}`).get();
  const entitlements = (snap.get('entitlements') as string[]) ?? [];
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, entitlements });
}

async function grantEntitlement(
  uid: string,
  productId: string,
  eventId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const customerRef = db.doc(`customers/${uid}`);
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
  await customerRef.set(
    {
      uid,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
      entitlements: FieldValue.arrayUnion(productId),
      // Map the subscription -> product so a later cancellation revokes the
      // right entitlement.
      ...(subscriptionId ? { subscriptions: { [subscriptionId]: productId } } : {}),
      purchaseHistory: FieldValue.arrayUnion({
        productId,
        stripeEventId: eventId,
        at: new Date().toISOString(),
        amount: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
      }),
    },
    { merge: true },
  );

  // Reflect entitlements into custom claims (B2C users live in the b2c tenant).
  await syncEntitlementClaims(uid);
}

/**
 * Revoke the entitlement a subscription granted. Looks up the customer by Stripe
 * customer id and the product via the stored subscription->product map, removes
 * it from `entitlements`, drops the mapping, and re-syncs custom claims.
 */
async function revokeSubscription(subscriptionId: string, customerId: string): Promise<void> {
  const q = await db.collection('customers').where('stripeCustomerId', '==', customerId).get();
  if (q.empty) return;

  const snap = q.docs[0];
  const uid = snap.id;
  const subscriptions = (snap.get('subscriptions') as Record<string, string> | undefined) ?? {};
  const productId = subscriptions[subscriptionId];
  if (!productId) return; // nothing mapped to this subscription

  await db.doc(`customers/${uid}`).set(
    {
      entitlements: FieldValue.arrayRemove(productId),
      subscriptions: { [subscriptionId]: FieldValue.delete() },
    },
    { merge: true },
  );
  await syncEntitlementClaims(uid);
}
