import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { adminAuth, db } from '../lib/admin';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

/**
 * Stripe webhook. Entitlements are granted ONLY here, on a signature-verified
 * event, and are idempotent via the stripe/events/{eventId} log. The client is
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
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        STRIPE_WEBHOOK_SECRET.value(),
      );
    } catch (err) {
      res.status(400).send(`Webhook signature verification failed: ${(err as Error).message}`);
      return;
    }

    // Idempotency: process each event id at most once.
    const eventRef = db.doc(`stripe/events/${event.id}`);
    const already = await eventRef.get();
    if (already.exists) {
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
    }

    await eventRef.set({
      eventId: event.id,
      type: event.type,
      processedAt: new Date().toISOString(),
    });

    res.status(200).send('ok');
  },
);

async function grantEntitlement(
  uid: string,
  productId: string,
  eventId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const customerRef = db.doc(`b2c/customers/${uid}`);
  await customerRef.set(
    {
      uid,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
      entitlements: FieldValue.arrayUnion(productId),
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
  const snap = await customerRef.get();
  const entitlements = (snap.get('entitlements') as string[]) ?? [productId];
  const existing = (await adminAuth.getUser(uid)).customClaims ?? {};
  await adminAuth.setCustomUserClaims(uid, { ...existing, entitlements });
}
