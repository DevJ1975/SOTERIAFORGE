import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import Stripe from 'stripe';
import { db } from '../lib/admin';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
/** Public storefront origin, e.g. https://soteriaforge.com — used for redirects. */
const STOREFRONT_URL = defineString('STOREFRONT_URL', { default: 'https://soteriaforge.com' });

/**
 * Create a Stripe Checkout session for a catalog product. Entitlements are NOT
 * granted here — only the verified `stripeWebhook` grants them. This just starts
 * the hosted checkout and returns its URL.
 */
export const createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const caller = request.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required to purchase.');

  const productId = String((request.data as { productId?: unknown })?.productId ?? '');
  if (!productId) throw new HttpsError('invalid-argument', 'productId is required.');

  const productSnap = await db.doc(`catalog/${productId}`).get();
  if (!productSnap.exists || productSnap.get('published') !== true) {
    throw new HttpsError('not-found', 'Product not available.');
  }
  const priceId = productSnap.get('stripePriceId') as string;
  const mode = (productSnap.get('mode') as 'payment' | 'subscription') ?? 'payment';

  const stripe = new Stripe(STRIPE_SECRET_KEY.value());

  // Reuse the customer's Stripe id if we have one.
  const customerSnap = await db.doc(`customers/${caller.uid}`).get();
  const stripeCustomerId = customerSnap.get('stripeCustomerId') as string | undefined;

  const base = STOREFRONT_URL.value();
  const session = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: caller.uid,
    metadata: { uid: caller.uid, productId },
    ...(stripeCustomerId
      ? { customer: stripeCustomerId }
      : { customer_email: caller.token.email as string | undefined }),
    success_url: `${base}/account?checkout=success`,
    cancel_url: `${base}/catalog?checkout=cancelled`,
  });

  return { url: session.url };
});

/** Create a Stripe Billing Portal session so customers can manage subscriptions. */
export const createBillingPortalSession = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const caller = request.auth;
    if (!caller) throw new HttpsError('unauthenticated', 'Sign-in required.');

    const customerSnap = await db.doc(`customers/${caller.uid}`).get();
    const stripeCustomerId = customerSnap.get('stripeCustomerId') as string | undefined;
    if (!stripeCustomerId) {
      throw new HttpsError('failed-precondition', 'No billing account yet.');
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${STOREFRONT_URL.value()}/account`,
    });
    return { url: session.url };
  },
);
