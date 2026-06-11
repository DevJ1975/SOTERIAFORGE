import { z } from 'zod';
import { docId } from '@forge/shared';
import {
  HttpsError,
  onCall,
  type CallableFunction,
  type CallableOptions,
} from 'firebase-functions/v2/https';
import { createAuthAdapter, createCommerceDbAdapter, createStripeAdapter } from './adapters';
import { FunctionsDomainError } from './errors';
import { grantEntitlement } from './grant-entitlement';
import type { CommercePorts, StripePort } from './ports';

/**
 * Pure core + onCall builder for B2C checkout (Phase 5).
 *
 * Any signed-in user may buy — B2C customers carry role 'b2c_customer' +
 * tenantId 'b2c', but B2B members purchase too, so the only auth requirement
 * is a verified uid on the token (no role check).
 *
 * EMULATED MODE: when process.env['STRIPE_SECRET_KEY'] is absent (emulators /
 * local dev — in production it is a Firebase Functions secret), no Stripe call
 * is made. Instead the entitlement is granted IMMEDIATELY through the same
 * grantEntitlement helper the webhook uses, and the response is flagged
 * { emulated: true } with sessionId 'cs_test_emulated_<productId>' and a url
 * pointing at successUrl?emulated=1&product=<productId> — so the storefront
 * dev loop works end-to-end without Stripe.
 */

const httpsUrl = z.string().url().startsWith('https://', 'Must be an https:// URL');

const createCheckoutSessionInput = z.object({
  productId: docId,
  successUrl: httpsUrl,
  cancelUrl: httpsUrl,
});
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionInput>;

export interface CheckoutDeps extends CommercePorts {
  stripe: StripePort;
}

export interface CheckoutEnv {
  /** process.env['STRIPE_SECRET_KEY']; absent → emulated mode. */
  stripeSecretKey?: string;
}

export interface CreateCheckoutSessionResult {
  sessionId: string;
  url: string;
  /** Present (true) only on the emulator/dev path — no real Stripe session exists. */
  emulated?: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pure core: validate input, require a signed-in caller, load the published
 * product, and create the Checkout session (or run the emulated path).
 */
export async function createCheckoutSessionCore(
  deps: CheckoutDeps,
  env: CheckoutEnv,
  caller: unknown,
  rawInput: unknown,
): Promise<CreateCheckoutSessionResult> {
  const parsed = createCheckoutSessionInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new FunctionsDomainError(
      'invalid-argument',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const input = parsed.data;

  const token = isRecord(caller) ? caller : null;
  const uid = typeof token?.['uid'] === 'string' && token['uid'].length > 0 ? token['uid'] : null;
  if (!uid) {
    throw new FunctionsDomainError('permission-denied', 'Caller must be signed in');
  }
  const email = typeof token?.['email'] === 'string' ? token['email'] : undefined;

  const product = await deps.db.getProduct(input.productId);
  // Unpublished products are hidden, not "forbidden" — same not-found as missing.
  if (!product || product['published'] !== true) {
    throw new FunctionsDomainError('not-found', `Product '${input.productId}' is not available`);
  }
  const stripePriceId =
    typeof product['stripePriceId'] === 'string' && product['stripePriceId'].length > 0
      ? product['stripePriceId']
      : null;
  if (!stripePriceId) {
    throw new FunctionsDomainError(
      'invalid-argument',
      `Product '${input.productId}' has no stripePriceId configured`,
    );
  }
  const mode = product['mode'] === 'subscription' ? 'subscription' : 'payment';

  if (!env.stripeSecretKey) {
    // Emulated dev path: grant immediately via the webhook's grant helper.
    await grantEntitlement(deps, uid, input.productId, {
      stripeEventId: `evt_emulated_${input.productId}`,
      at: new Date().toISOString(),
    });
    return {
      sessionId: `cs_test_emulated_${input.productId}`,
      url: `${input.successUrl}?emulated=1&product=${input.productId}`,
      emulated: true,
    };
  }

  const session = await deps.stripe.createCheckoutSession({
    mode,
    lineItems: [{ price: stripePriceId, quantity: 1 }],
    clientReferenceId: uid,
    metadata: { productId: input.productId, uid },
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    ...(email ? { customerEmail: email } : {}),
  });
  return { sessionId: session.id, url: session.url };
}

// ---- v2 builder (main.ts wiring is one line) -----------------------------------

/**
 * CALLABLE_OPTS plus the Stripe secrets. Declaring `secrets` binds the Secret
 * Manager values in production; the emulators run without them (emulated mode).
 */
export const COMMERCE_CALLABLE_OPTS: CallableOptions = {
  cors: true,
  region: 'us-central1',
  secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
};

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof FunctionsDomainError) {
    return new HttpsError(err.code, err.message);
  }
  console.error('Unhandled error in createCheckoutSession', err);
  return new HttpsError('internal', 'Internal error');
}

/**
 * main.ts: `export const createCheckoutSession = buildCreateCheckoutSessionCallable();`
 */
export function buildCreateCheckoutSessionCallable(
  deps: CheckoutDeps = {
    auth: createAuthAdapter(),
    db: createCommerceDbAdapter(),
    stripe: createStripeAdapter(),
  },
): CallableFunction<unknown, Promise<CreateCheckoutSessionResult>> {
  return onCall(COMMERCE_CALLABLE_OPTS, async (request) => {
    try {
      return await createCheckoutSessionCore(
        deps,
        { stripeSecretKey: process.env['STRIPE_SECRET_KEY'] },
        request.auth?.token,
        request.data,
      );
    } catch (err) {
      throw toHttpsError(err);
    }
  });
}
