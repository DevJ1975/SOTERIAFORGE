import type { CatalogProduct } from '@forge/shared';

/**
 * Entitlement Convention
 * ----------------------
 * A user's entitlements array (sourced from Firebase custom claims, written
 * ONLY by the verified Stripe webhook Cloud Function) contains productIds.
 *
 * Access rules:
 *  1. `all_access` — a special sentinel productId string. If present in the
 *     user's entitlements, the user may access ANY product regardless of its
 *     grants.kind. This is also triggered when a product's grants.kind is
 *     'all_access' AND the user holds the corresponding productId entitlement.
 *
 *  2. course / module products — the user must hold the product's own `id`
 *     in their entitlements array (i.e. entitlements.includes(product.id)).
 *
 * The server is the sole authority on entitlements. The client NEVER writes
 * entitlement state; it only reads what the verified webhook has set.
 */

/**
 * Returns true when the given `productId` is found in the entitlements array
 * OR the special 'all_access' sentinel is present.
 *
 * This is the primitive building block; prefer `resolveAccess` for richer
 * diagnostics at call sites.
 */
export function isEntitled(entitlements: string[], productId: string): boolean {
  return entitlements.includes('all_access') || entitlements.includes(productId);
}

export interface AccessResult {
  allowed: boolean;
  /** Human-readable reason, present when access is denied. */
  reason?: string;
}

/**
 * Determines whether the user may access the given `product`.
 *
 * Grant resolution order:
 *  1. `all_access` sentinel in entitlements → allowed for any product.
 *  2. product.grants.kind === 'all_access' → user must hold product.id; if
 *     they do, they also gain blanket access (same as sentinel above for this
 *     check's scope — the product itself is accessible).
 *  3. course / module → user must hold product.id in entitlements.
 *
 * @param product    - The catalog product being gated.
 * @param entitlements - The user's entitlement list from verified claims.
 */
export function resolveAccess(product: CatalogProduct, entitlements: string[]): AccessResult {
  // All-access sentinel: user may access anything.
  if (entitlements.includes('all_access')) {
    return { allowed: true };
  }

  // Product grants all_access (e.g. a subscription tier product) —
  // user still needs to own that specific product.
  if (product.grants.kind === 'all_access') {
    if (entitlements.includes(product.id)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Purchase required: "${product.title}" grants all-access but you have not purchased it.`,
    };
  }

  // Standard course or module product: user must hold product.id.
  if (entitlements.includes(product.id)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `You are not entitled to "${product.title}". Purchase the product to gain access.`,
  };
}
