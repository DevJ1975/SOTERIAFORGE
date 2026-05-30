import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@assurance/auth';
import { isEntitled } from './entitlements';

/**
 * Paywall route guard. Requires the signed-in user to hold the entitlement for
 * `productId` (or the `all_access` entitlement). Entitlements come from custom
 * claims, which are set ONLY by the verified Stripe webhook — so this guard
 * cannot be bypassed by client state. It is the route-level half of gating;
 * content delivery is additionally gated server-side (signed URLs / checks).
 *
 * Usage: `canActivate: [entitlementGuard('course-osha-101')]`.
 */
export function entitlementGuard(productId: string): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.claims()) await auth.refreshClaims();
    const entitlements = auth.claims()?.entitlements ?? [];

    if (isEntitled(entitlements, productId) || entitlements.includes('all_access')) {
      return true;
    }
    return router.createUrlTree(['/catalog'], { queryParams: { locked: productId } });
  };
}
