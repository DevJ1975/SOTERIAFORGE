import { B2C_TENANT_ID } from '@forge/shared';
import { makeCommerceFakes } from './fakes';
import type { StripeWebhookEvent } from './ports';
import { stripeWebhookCore } from './stripe-webhook.core';

const env = { webhookSecret: 'whsec_test' };
const rawBody = '{"raw":"payload"}';
const signature = 't=1,v1=sig';

function completedEvent(id = 'evt_1', object: Record<string, unknown> = {}): StripeWebhookEvent {
  return {
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { productId: 'prod-1', uid: 'buyer-1' },
        amount_total: 4900,
        currency: 'usd',
        customer: 'cus_123',
        ...object,
      },
    },
  };
}

function subscriptionDeletedEvent(object: Record<string, unknown> = {}): StripeWebhookEvent {
  return {
    id: 'evt_sub_del_1',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        customer: 'cus_123',
        items: { data: [{ price: { id: 'price_sub' } }] },
        ...object,
      },
    },
  };
}

function makeDeps(event: StripeWebhookEvent | null = completedEvent()) {
  const deps = makeCommerceFakes();
  deps.stripe.webhookEvent = event;
  return deps;
}

describe('stripeWebhookCore', () => {
  it('returns 400 on signature verification failure and writes nothing', async () => {
    const deps = makeDeps(null); // fake throws from constructWebhookEvent
    const outcome = await stripeWebhookCore(deps, env, rawBody, signature);

    expect(outcome.status).toBe(400);
    expect(outcome.body).toEqual({ error: 'invalid-signature' });
    expect(deps.db.eventLog.size).toBe(0);
    expect(deps.db.customers.size).toBe(0);
    // The raw body and configured secret reached the verifier untouched.
    expect(deps.stripe.constructCalls).toEqual([{ rawBody, signature, secret: 'whsec_test' }]);
  });

  it('returns 400 when the webhook secret is not configured (emulators)', async () => {
    const deps = makeDeps();
    const outcome = await stripeWebhookCore(deps, {}, rawBody, signature);
    expect(outcome.status).toBe(400);
    expect(deps.stripe.constructCalls).toHaveLength(0);
  });

  it('short-circuits duplicate events BEFORE any handler runs', async () => {
    const deps = makeDeps();
    deps.db.eventLog.set('evt_1', { eventId: 'evt_1', type: 'checkout.session.completed' });

    const outcome = await stripeWebhookCore(deps, env, rawBody, signature);

    expect(outcome).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(deps.db.setCustomerCalls).toHaveLength(0);
    expect(deps.auth.setClaimsCalls).toHaveLength(0);
    expect(deps.db.setEventLogCalls).toHaveLength(0); // log not rewritten either
  });

  it('checkout.session.completed grants a fresh b2c user and logs the event after', async () => {
    const deps = makeDeps();
    const outcome = await stripeWebhookCore(deps, env, rawBody, signature);

    expect(outcome).toEqual({ status: 200, body: { received: true } });

    const customer = deps.db.customers.get('buyer-1');
    expect(customer?.['uid']).toBe('buyer-1');
    expect(customer?.['entitlements']).toEqual(['prod-1']);
    expect(customer?.['stripeCustomerId']).toBe('cus_123');
    expect(customer?.['purchaseHistory']).toEqual([
      {
        productId: 'prod-1',
        stripeEventId: 'evt_1',
        at: expect.any(String),
        amount: 4900,
        currency: 'usd',
      },
    ]);

    // Fresh user → full b2c claims.
    expect(deps.auth.claims.get('buyer-1')).toEqual({
      role: 'b2c_customer',
      tenantId: B2C_TENANT_ID,
      entitlements: ['prod-1'],
    });

    const log = deps.db.eventLog.get('evt_1');
    expect(log).toMatchObject({ eventId: 'evt_1', type: 'checkout.session.completed' });
    expect(typeof log?.['processedAt']).toBe('string');
  });

  it('dedupes entitlements on repurchase but still appends purchase history', async () => {
    const deps = makeDeps();
    await stripeWebhookCore(deps, env, rawBody, signature);

    deps.stripe.webhookEvent = completedEvent('evt_2');
    await stripeWebhookCore(deps, env, rawBody, signature);

    const customer = deps.db.customers.get('buyer-1');
    expect(customer?.['entitlements']).toEqual(['prod-1']);
    expect(customer?.['purchaseHistory']).toHaveLength(2);
    expect(deps.db.eventLog.size).toBe(2);
  });

  it('merges claims for an existing B2B member: role/tenantId kept, entitlements updated', async () => {
    const deps = makeDeps();
    deps.auth.claims.set('buyer-1', {
      role: 'learner',
      tenantId: 'acme',
      gcipTenantId: 'gcip-acme',
      entitlements: [],
    });

    await stripeWebhookCore(deps, env, rawBody, signature);

    expect(deps.auth.claims.get('buyer-1')).toEqual({
      role: 'learner',
      tenantId: 'acme',
      gcipTenantId: 'gcip-acme',
      entitlements: ['prod-1'],
    });
  });

  it('customer.subscription.deleted revokes via price-id lookup and re-mirrors claims', async () => {
    const deps = makeDeps(subscriptionDeletedEvent());
    deps.db.products.set('prod-sub', { id: 'prod-sub', stripePriceId: 'price_sub' });
    deps.db.customers.set('buyer-1', {
      uid: 'buyer-1',
      stripeCustomerId: 'cus_123',
      entitlements: ['prod-sub', 'prod-1'],
    });
    deps.auth.claims.set('buyer-1', {
      role: 'b2c_customer',
      tenantId: B2C_TENANT_ID,
      entitlements: ['prod-sub', 'prod-1'],
    });

    const outcome = await stripeWebhookCore(deps, env, rawBody, signature);

    expect(outcome.status).toBe(200);
    expect(deps.db.customers.get('buyer-1')?.['entitlements']).toEqual(['prod-1']);
    expect(deps.auth.claims.get('buyer-1')).toEqual({
      role: 'b2c_customer',
      tenantId: B2C_TENANT_ID,
      entitlements: ['prod-1'],
    });
    expect(deps.db.eventLog.has('evt_sub_del_1')).toBe(true);
  });

  it('customer.subscription.deleted prefers metadata.productId over price lookup', async () => {
    const deps = makeDeps(
      subscriptionDeletedEvent({ metadata: { productId: 'prod-meta' }, items: undefined }),
    );
    deps.db.customers.set('buyer-1', {
      uid: 'buyer-1',
      stripeCustomerId: 'cus_123',
      entitlements: ['prod-meta'],
    });

    await stripeWebhookCore(deps, env, rawBody, signature);

    expect(deps.db.customers.get('buyer-1')?.['entitlements']).toEqual([]);
  });

  it('marks unknown event types processed (200 + event log) without touching data', async () => {
    const deps = makeDeps({ id: 'evt_other', type: 'invoice.paid', data: { object: {} } });

    const outcome = await stripeWebhookCore(deps, env, rawBody, signature);

    expect(outcome).toEqual({ status: 200, body: { received: true } });
    expect(deps.db.eventLog.has('evt_other')).toBe(true);
    expect(deps.db.setCustomerCalls).toHaveLength(0);
    expect(deps.auth.setClaimsCalls).toHaveLength(0);
  });

  it('writes the event log only AFTER success: a failed grant leaves no log, so a retry works', async () => {
    const deps = makeDeps();
    deps.db.failSetCustomer = true;

    const failed = await stripeWebhookCore(deps, env, rawBody, signature);
    expect(failed.status).toBe(500);
    expect(deps.db.eventLog.size).toBe(0);
    expect(deps.auth.setClaimsCalls).toHaveLength(0);

    // Stripe retries the same event; this time processing succeeds.
    deps.db.failSetCustomer = false;
    const retried = await stripeWebhookCore(deps, env, rawBody, signature);
    expect(retried).toEqual({ status: 200, body: { received: true } });
    expect(deps.db.customers.get('buyer-1')?.['entitlements']).toEqual(['prod-1']);
    expect(deps.db.eventLog.has('evt_1')).toBe(true);
  });
});
