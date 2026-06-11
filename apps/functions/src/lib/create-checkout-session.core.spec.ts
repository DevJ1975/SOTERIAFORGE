import { B2C_TENANT_ID } from '@forge/shared';
import { createCheckoutSessionCore } from './create-checkout-session.core';
import { makeCommerceFakes } from './fakes';

const buyerToken = { uid: 'buyer-1', email: 'buyer@example.com' };
const env = { stripeSecretKey: 'sk_test_123' };
const input = {
  productId: 'prod-1',
  successUrl: 'https://shop.soteriaforge.com/success',
  cancelUrl: 'https://shop.soteriaforge.com/cancel',
};

function product(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prod-1',
    title: 'Forklift Safety Course',
    grants: { kind: 'course', refId: 'course-1' },
    stripePriceId: 'price_123',
    mode: 'payment',
    published: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDeps() {
  const deps = makeCommerceFakes();
  deps.db.products.set('prod-1', product());
  return deps;
}

describe('createCheckoutSessionCore', () => {
  it('happy path: creates a session with the documented shape', async () => {
    const deps = makeDeps();
    deps.stripe.nextSession = { id: 'cs_test_42', url: 'https://checkout.stripe.com/c/pay/42' };

    const result = await createCheckoutSessionCore(deps, env, buyerToken, input);

    expect(result).toEqual({
      sessionId: 'cs_test_42',
      url: 'https://checkout.stripe.com/c/pay/42',
    });
    expect(result.emulated).toBeUndefined();
    expect(deps.stripe.createdSessions).toHaveLength(1);
    expect(deps.stripe.createdSessions[0]).toEqual({
      mode: 'payment',
      lineItems: [{ price: 'price_123', quantity: 1 }],
      clientReferenceId: 'buyer-1',
      metadata: { productId: 'prod-1', uid: 'buyer-1' },
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: 'buyer@example.com',
    });
    // Real checkout never grants directly — the webhook does.
    expect(deps.db.customers.size).toBe(0);
    expect(deps.auth.setClaimsCalls).toHaveLength(0);
  });

  it('uses subscription mode for subscription products and omits absent email', async () => {
    const deps = makeDeps();
    deps.db.products.set('prod-1', product({ mode: 'subscription' }));

    await createCheckoutSessionCore(deps, env, { uid: 'buyer-1' }, input);

    expect(deps.stripe.createdSessions[0]?.mode).toBe('subscription');
    expect(deps.stripe.createdSessions[0]?.customerEmail).toBeUndefined();
  });

  it('rejects a missing product as not-found without calling Stripe', async () => {
    const deps = makeDeps();
    await expect(
      createCheckoutSessionCore(deps, env, buyerToken, { ...input, productId: 'nope' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(deps.stripe.createdSessions).toHaveLength(0);
  });

  it('rejects an unpublished product as not-found', async () => {
    const deps = makeDeps();
    deps.db.products.set('prod-1', product({ published: false }));
    await expect(createCheckoutSessionCore(deps, env, buyerToken, input)).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(deps.stripe.createdSessions).toHaveLength(0);
  });

  it.each([
    ['non-https successUrl', { ...input, successUrl: 'http://shop.example.com/success' }],
    ['non-https cancelUrl', { ...input, cancelUrl: 'http://shop.example.com/cancel' }],
    ['non-url successUrl', { ...input, successUrl: 'not-a-url' }],
    ['missing productId', { successUrl: input.successUrl, cancelUrl: input.cancelUrl }],
  ])('rejects bad input (%s) as invalid-argument', async (_label, bad) => {
    const deps = makeDeps();
    await expect(createCheckoutSessionCore(deps, env, buyerToken, bad)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(deps.stripe.createdSessions).toHaveLength(0);
  });

  it('rejects unauthenticated callers (no token / no uid) as permission-denied', async () => {
    const deps = makeDeps();
    await expect(createCheckoutSessionCore(deps, env, undefined, input)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      createCheckoutSessionCore(deps, env, { email: 'x@example.com' }, input),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.stripe.createdSessions).toHaveLength(0);
    expect(deps.db.customers.size).toBe(0);
  });

  it('emulated mode (no STRIPE_SECRET_KEY): flags the response and grants immediately', async () => {
    const deps = makeDeps();

    const result = await createCheckoutSessionCore(deps, {}, buyerToken, input);

    expect(result).toEqual({
      sessionId: 'cs_test_emulated_prod-1',
      url: 'https://shop.soteriaforge.com/success?emulated=1&product=prod-1',
      emulated: true,
    });
    expect(deps.stripe.createdSessions).toHaveLength(0);

    // Granted through the same helper the webhook uses.
    const customer = deps.db.customers.get('buyer-1');
    expect(customer?.['entitlements']).toEqual(['prod-1']);
    expect(customer?.['purchaseHistory']).toEqual([
      expect.objectContaining({ productId: 'prod-1', stripeEventId: 'evt_emulated_prod-1' }),
    ]);
    expect(deps.auth.claims.get('buyer-1')).toEqual({
      role: 'b2c_customer',
      tenantId: B2C_TENANT_ID,
      entitlements: ['prod-1'],
    });
  });

  it('emulated mode still validates the product (unpublished rejected, nothing granted)', async () => {
    const deps = makeDeps();
    deps.db.products.set('prod-1', product({ published: false }));
    await expect(createCheckoutSessionCore(deps, {}, buyerToken, input)).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(deps.db.customers.size).toBe(0);
    expect(deps.auth.setClaimsCalls).toHaveLength(0);
  });
});
