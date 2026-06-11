/**
 * Minimal, Promise-based ports the cores depend on. Real implementations live in
 * adapters.ts (firebase-admin); tests use in-memory fakes (fakes.ts).
 */

export interface CreateUserOptions {
  email: string;
  displayName?: string;
}

export interface AuthPort {
  /** Replace a user's custom claims; `null` clears them entirely. */
  setCustomClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>;
  /**
   * Read a user's current custom claims (e.g. before a merge-preserving claims
   * write). Returns `null` when no such user exists.
   */
  getUser(uid: string): Promise<{ customClaims?: Record<string, unknown> } | null>;
  /** Resolve an existing user by email, or `null` when none exists. */
  getUserByEmail(email: string): Promise<{ uid: string } | null>;
  /** Create a new auth user. */
  createUser(opts: CreateUserOptions): Promise<{ uid: string }>;
  /**
   * Create a GCIP (Identity Platform) tenant. Optional: adapters return `null`
   * when Identity Platform is unavailable on the project.
   */
  createGcipTenant?(displayName: string): Promise<{ tenantId: string } | null>;
}

export interface DbPort {
  getTenant(tenantId: string): Promise<Record<string, unknown> | null>;
  setTenant(tenantId: string, data: Record<string, unknown>): Promise<void>;
  getMember(tenantId: string, uid: string): Promise<Record<string, unknown> | null>;
  /** Upsert (merge) a member document. */
  setMember(tenantId: string, uid: string, data: Record<string, unknown>): Promise<void>;
}

export interface StatementDbPort {
  /** Persist one xAPI statement at /tenants/{tenantId}/xapiStatements/{id}. */
  saveStatement(tenantId: string, statementId: string, doc: Record<string, unknown>): Promise<void>;
}

/**
 * Persistence the gamification cores need. Member reads/writes are shared with
 * DbPort; the rest covers the XP ledger, badge awards and game-result stamps.
 */
export interface GamificationDbPort extends Pick<DbPort, 'getMember' | 'setMember'> {
  /** Read one XP ledger entry, or `null` when it does not exist. */
  getXpEvent(
    tenantId: string,
    uid: string,
    eventId: string,
  ): Promise<Record<string, unknown> | null>;
  /** Persist one XP ledger entry at /tenants/{t}/members/{uid}/xpEvents/{eventId}. */
  addXpEvent(
    tenantId: string,
    uid: string,
    eventId: string,
    doc: Record<string, unknown>,
  ): Promise<void>;
  /** Read one badge award, or `null` when the badge was never earned. */
  getAward(tenantId: string, uid: string, badgeId: string): Promise<Record<string, unknown> | null>;
  /** Persist one badge award at /tenants/{t}/members/{uid}/awards/{badgeId}. */
  setAward(
    tenantId: string,
    uid: string,
    badgeId: string,
    doc: Record<string, unknown>,
  ): Promise<void>;
  /** Merge fields onto /tenants/{t}/gameResults/{resultId} (e.g. the xpAwarded stamp). */
  updateGameResult(
    tenantId: string,
    resultId: string,
    data: Record<string, unknown>,
  ): Promise<void>;
}

export interface CorePorts {
  auth: AuthPort;
  db: DbPort;
}

// ---- B2C commerce (Phase 5) ----------------------------------------------------

/**
 * Narrow projection of a verified Stripe webhook event — only what the webhook
 * core consumes. Keeps the cores free of the stripe SDK's types.
 */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Options the checkout core passes when creating a Stripe Checkout session. */
export interface StripeCheckoutSessionOptions {
  mode: 'payment' | 'subscription';
  lineItems: Array<{ price: string; quantity: number }>;
  /** Mapped to Stripe's `client_reference_id` (the buyer's uid). */
  clientReferenceId: string;
  /** Echoed back on the checkout.session.completed webhook. */
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

/**
 * Thin seam over the stripe SDK. The real adapter (adapters.ts) reads
 * STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET lazily; tests use FakeStripePort
 * and never instantiate the SDK.
 */
export interface StripePort {
  createCheckoutSession(opts: StripeCheckoutSessionOptions): Promise<{ id: string; url: string }>;
  /**
   * Verify the webhook signature against the raw (unparsed) request body and
   * return the event. Throws on signature mismatch.
   */
  constructWebhookEvent(
    rawBody: Buffer | string,
    signature: string,
    secret: string,
  ): StripeWebhookEvent;
}

/**
 * Persistence for the B2C storefront. Concrete layout (see firestore.rules):
 *   /b2c/store/catalog/{productId}    — catalogProduct
 *   /b2c/store/customers/{uid}        — b2cCustomer
 *   /stripe/webhook/events/{eventId}  — stripeEventLog (webhook idempotency;
 *     the docblock path /stripe/events/{eventId} is odd-segment, so the layout
 *     interposes the fixed singleton document /stripe/webhook, mirroring
 *     /b2c/store). All function-only; clients never write any of these.
 */
export interface CommerceDbPort {
  getProduct(productId: string): Promise<Record<string, unknown> | null>;
  getCustomer(uid: string): Promise<Record<string, unknown> | null>;
  /** Upsert (merge) a b2c customer document. */
  setCustomer(uid: string, doc: Record<string, unknown>): Promise<void>;
  /** Reverse lookup for subscription webhooks (customer id -> our customer doc). */
  findCustomerByStripeId(
    stripeCustomerId: string,
  ): Promise<{ uid: string; data: Record<string, unknown> } | null>;
  /** Catalog products selling a given Stripe price (price id -> productId resolution). */
  listProductsByPriceId(stripePriceId: string): Promise<Array<Record<string, unknown>>>;
  getEventLog(eventId: string): Promise<Record<string, unknown> | null>;
  setEventLog(eventId: string, doc: Record<string, unknown>): Promise<void>;
}

/** Ports shared by the commerce cores (checkout + webhook + grant helper). */
export interface CommercePorts {
  auth: AuthPort;
  db: CommerceDbPort;
}
