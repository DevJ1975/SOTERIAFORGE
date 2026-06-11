import { B2C_TENANT_ID } from '@forge/shared';
import type { AuthPort, CommercePorts } from './ports';

/**
 * Entitlement grant/revoke helper shared by the Stripe webhook core and the
 * emulated checkout path (create-checkout-session.core.ts), so the dev loop
 * and production exercise the exact same write path.
 *
 * Claims-merge rules (mirrorEntitlementClaims):
 * - Fresh user, no claims, or existing role 'b2c_customer' → write
 *   { role: 'b2c_customer', tenantId: B2C_TENANT_ID, entitlements }.
 * - Existing non-b2c role (B2B member or superadmin) → NEVER clobber the
 *   tenant-scoped role: keep every existing claim (role, tenantId,
 *   gcipTenantId, …) and only replace the entitlements array.
 */

/** Stripe context recorded on the purchase-history entry. */
export interface PurchaseContext {
  stripeEventId: string;
  /** ISO datetime the grant was processed. */
  at: string;
  /** Stripe amount_total (smallest currency unit), when present on the session. */
  amount?: number;
  currency?: string;
  /** Stripe customer id, stored for subscription-revocation reverse lookup. */
  stripeCustomerId?: string;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Mirror an updated entitlements list onto custom claims without clobbering a
 * B2B identity. See the module docblock for the merge rules.
 */
export async function mirrorEntitlementClaims(
  auth: AuthPort,
  uid: string,
  entitlements: string[],
): Promise<void> {
  const user = await auth.getUser(uid);
  const existing = user?.customClaims ?? {};
  const existingRole = typeof existing['role'] === 'string' ? existing['role'] : undefined;
  const hasNonB2cRole = existingRole !== undefined && existingRole !== 'b2c_customer';
  const claims = hasNonB2cRole
    ? { ...existing, entitlements }
    : { ...existing, role: 'b2c_customer', tenantId: B2C_TENANT_ID, entitlements };
  await auth.setCustomClaims(uid, claims);
}

/**
 * Upsert the b2c customer doc (/b2c/store/customers/{uid}): add `productId` to
 * the deduped entitlements, append a purchase-history entry, store the Stripe
 * customer id when present, then mirror the entitlements onto custom claims.
 */
export async function grantEntitlement(
  deps: CommercePorts,
  uid: string,
  productId: string,
  purchase: PurchaseContext,
): Promise<{ entitlements: string[] }> {
  const existing = (await deps.db.getCustomer(uid)) ?? {};
  const current = stringArray(existing['entitlements']);
  const entitlements = current.includes(productId) ? current : [...current, productId];
  const history = Array.isArray(existing['purchaseHistory']) ? existing['purchaseHistory'] : [];
  const entry = {
    productId,
    stripeEventId: purchase.stripeEventId,
    at: purchase.at,
    ...(purchase.amount !== undefined ? { amount: purchase.amount } : {}),
    ...(purchase.currency !== undefined ? { currency: purchase.currency } : {}),
  };

  await deps.db.setCustomer(uid, {
    uid,
    entitlements,
    purchaseHistory: [...history, entry],
    ...(purchase.stripeCustomerId ? { stripeCustomerId: purchase.stripeCustomerId } : {}),
    ...(typeof existing['createdAt'] === 'string' ? {} : { createdAt: purchase.at }),
    updatedAt: purchase.at,
  });

  await mirrorEntitlementClaims(deps.auth, uid, entitlements);
  return { entitlements };
}

/**
 * Remove `productId` from the customer's entitlements (subscription ended) and
 * re-mirror claims under the same merge rules.
 */
export async function revokeEntitlement(
  deps: CommercePorts,
  uid: string,
  productId: string,
  at: string,
): Promise<{ entitlements: string[] }> {
  const existing = (await deps.db.getCustomer(uid)) ?? {};
  const entitlements = stringArray(existing['entitlements']).filter((id) => id !== productId);

  await deps.db.setCustomer(uid, { uid, entitlements, updatedAt: at });
  await mirrorEntitlementClaims(deps.auth, uid, entitlements);
  return { entitlements };
}
