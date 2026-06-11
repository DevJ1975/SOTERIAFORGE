import { onRequest, type HttpsFunction, type HttpsOptions } from 'firebase-functions/v2/https';
import { createAuthAdapter, createCommerceDbAdapter, createStripeAdapter } from './adapters';
import { grantEntitlement, revokeEntitlement } from './grant-entitlement';
import type { CommercePorts, StripePort, StripeWebhookEvent } from './ports';

/**
 * Stripe webhook core + onRequest builder (Phase 5).
 *
 * Flow:
 *   1. Verify the signature against the RAW request body (failure → 400).
 *   2. Idempotency FIRST: a /stripe/.../events/{event.id} log entry means the
 *      event was already fully processed → 200 { duplicate: true } before any
 *      handler runs.
 *   3. Dispatch: checkout.session.completed → grant; customer.subscription.deleted
 *      → revoke; anything else → log + 200.
 *   4. The event log is written ONLY AFTER successful processing — a handler
 *      failure returns 500 with no log entry, so Stripe's retry reprocesses it.
 *
 * Secrets: the signing secret comes from process.env['STRIPE_WEBHOOK_SECRET']
 * (a Firebase Functions secret in production, declared on the wrapper; absent
 * in emulators, where the endpoint answers 400 and the emulated checkout path
 * covers the dev loop instead).
 */

export interface StripeWebhookDeps extends CommercePorts {
  stripe: StripePort;
}

export interface StripeWebhookEnv {
  /** process.env['STRIPE_WEBHOOK_SECRET']; absent → endpoint not configured. */
  webhookSecret?: string;
}

/** Framework-free outcome the HTTP wrapper writes onto the response. */
export interface StripeWebhookOutcome {
  status: 200 | 400 | 500;
  body: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function metadataOf(object: Record<string, unknown>): Record<string, unknown> {
  const metadata = object['metadata'];
  return isRecord(metadata) ? metadata : {};
}

/** The price id on the first subscription item, when present. */
function subscriptionPriceId(subscription: Record<string, unknown>): string | undefined {
  const items = subscription['items'];
  if (!isRecord(items) || !Array.isArray(items['data'])) return undefined;
  const first: unknown = items['data'][0];
  if (!isRecord(first) || !isRecord(first['price'])) return undefined;
  return stringField(first['price'], 'id');
}

/** checkout.session.completed → grant the purchased entitlement. */
async function handleCheckoutSessionCompleted(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent,
): Promise<void> {
  const session = event.data.object;
  const metadata = metadataOf(session);
  const productId = stringField(metadata, 'productId');
  const uid = stringField(metadata, 'uid');
  if (!productId || !uid) {
    // Not one of ours (or created without metadata) — retrying cannot fix it.
    console.warn(`stripe webhook: event '${event.id}' has no {productId, uid} metadata; skipping`);
    return;
  }
  const amount = typeof session['amount_total'] === 'number' ? session['amount_total'] : undefined;
  const currency = stringField(session, 'currency');
  const stripeCustomerId = stringField(session, 'customer');
  await grantEntitlement(deps, uid, productId, {
    stripeEventId: event.id,
    at: new Date().toISOString(),
    ...(amount !== undefined ? { amount } : {}),
    ...(currency ? { currency } : {}),
    ...(stripeCustomerId ? { stripeCustomerId } : {}),
  });
}

/** customer.subscription.deleted → revoke the subscription's entitlement. */
async function handleSubscriptionDeleted(
  deps: StripeWebhookDeps,
  event: StripeWebhookEvent,
): Promise<void> {
  const subscription = event.data.object;
  const stripeCustomerId = stringField(subscription, 'customer');
  if (!stripeCustomerId) {
    console.warn(`stripe webhook: event '${event.id}' carries no customer id; skipping`);
    return;
  }

  // Resolve the productId: subscription metadata first, then price-id lookup.
  let productId = stringField(metadataOf(subscription), 'productId');
  if (!productId) {
    const priceId = subscriptionPriceId(subscription);
    if (priceId) {
      const products = await deps.db.listProductsByPriceId(priceId);
      productId = products.map((p) => stringField(p, 'id')).find((id) => id !== undefined);
    }
  }
  if (!productId) {
    console.warn(`stripe webhook: event '${event.id}' resolves to no catalog product; skipping`);
    return;
  }

  const customer = await deps.db.findCustomerByStripeId(stripeCustomerId);
  if (!customer) {
    console.warn(`stripe webhook: no b2c customer for stripe customer '${stripeCustomerId}'`);
    return;
  }
  await revokeEntitlement(deps, customer.uid, productId, new Date().toISOString());
}

async function dispatch(deps: StripeWebhookDeps, event: StripeWebhookEvent): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(deps, event);
      return;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(deps, event);
      return;
    default:
      console.log(`stripe webhook: ignoring unhandled event type '${event.type}' (${event.id})`);
  }
}

/** Pure core — no HTTP types. The wrapper passes the raw body + signature header. */
export async function stripeWebhookCore(
  deps: StripeWebhookDeps,
  env: StripeWebhookEnv,
  rawBody: Buffer | string,
  signature: string,
): Promise<StripeWebhookOutcome> {
  if (!env.webhookSecret) {
    console.error('stripe webhook: STRIPE_WEBHOOK_SECRET is not configured');
    return { status: 400, body: { error: 'webhook-not-configured' } };
  }

  let event: StripeWebhookEvent;
  try {
    event = deps.stripe.constructWebhookEvent(rawBody, signature, env.webhookSecret);
  } catch (err) {
    console.warn('stripe webhook: signature verification failed', err);
    return { status: 400, body: { error: 'invalid-signature' } };
  }

  // Idempotency FIRST: short-circuit before any handler touches data.
  if (await deps.db.getEventLog(event.id)) {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    await dispatch(deps, event);
  } catch (err) {
    // No event-log write → Stripe retries → the event is reprocessed.
    console.error(`stripe webhook: processing failed for '${event.id}' (${event.type})`, err);
    return { status: 500, body: { error: 'processing-failed' } };
  }

  // Only after successful processing.
  await deps.db.setEventLog(event.id, {
    eventId: event.id,
    type: event.type,
    processedAt: new Date().toISOString(),
  });
  return { status: 200, body: { received: true } };
}

// ---- HTTP wrapper ---------------------------------------------------------------

/**
 * Structural request/response types so the handler stays framework-free and
 * unit-testable; firebase-functions' Request/Response satisfy them. v2
 * onRequest exposes the unparsed payload as `req.rawBody`, which Stripe's
 * signature check REQUIRES (the JSON-parsed body would never verify).
 */
export interface StripeWebhookRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer | string;
}

export interface StripeWebhookResponse {
  set(name: string, value: string): unknown;
  status(code: number): unknown;
  json(body: unknown): unknown;
}

/** Build the POST /stripeWebhook handler over the commerce ports. */
export function createStripeWebhookHandler(deps: StripeWebhookDeps) {
  return async (req: StripeWebhookRequest, res: StripeWebhookResponse): Promise<void> => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      res.status(405);
      res.json({ error: 'method-not-allowed' });
      return;
    }
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || signature.length === 0) {
      res.status(400);
      res.json({ error: 'missing-signature' });
      return;
    }
    const outcome = await stripeWebhookCore(
      deps,
      { webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] },
      req.rawBody ?? '',
      signature,
    );
    res.status(outcome.status);
    res.json(outcome.body);
  };
}

/**
 * Binds both Stripe secrets in production; the emulators run without them.
 * No CORS: Stripe servers call this endpoint, never browsers.
 */
const WEBHOOK_OPTS: HttpsOptions = {
  region: 'us-central1',
  secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
};

/**
 * main.ts: `export const stripeWebhook = buildStripeWebhook();`
 */
export function buildStripeWebhook(
  deps: StripeWebhookDeps = {
    auth: createAuthAdapter(),
    db: createCommerceDbAdapter(),
    stripe: createStripeAdapter(),
  },
): HttpsFunction {
  return onRequest(WEBHOOK_OPTS, createStripeWebhookHandler(deps));
}
