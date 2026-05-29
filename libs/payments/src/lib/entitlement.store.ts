import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '@forge/auth';
import { isEntitled } from './entitlements';

/**
 * EntitlementStore
 * ----------------
 * Lightweight signal-based store that derives entitlement state from the
 * AuthService's verified custom claims.
 *
 * The entitlements list is written ONLY by the server-side Stripe webhook
 * Cloud Function and propagated to the client via Firebase ID-token custom
 * claims. The store never mutates entitlement state.
 *
 * Usage:
 *   const store = inject(EntitlementStore);
 *   const allowed = store.canAccess('course-abc-123');
 *
 * Gate access at BOTH route guard level (via `canAccess`) AND at content
 * delivery (Firestore security rules / Cloud Function auth checks).
 */
@Injectable({ providedIn: 'root' })
export class EntitlementStore {
  private readonly auth = inject(AuthService);

  /**
   * The user's current entitlement list, sourced from Firebase custom claims.
   * Empty array when unauthenticated or when claims carry no entitlements.
   */
  readonly entitlements = computed<string[]>(() => this.auth.claims()?.entitlements ?? []);

  /**
   * Returns a computed boolean signal that is `true` when the authenticated
   * user holds an entitlement for the given `productId` (or carries the
   * special 'all_access' sentinel entitlement).
   *
   * Example:
   *   const canWatch = store.canAccess('course-intro-to-soteriaforge');
   *   // use in template: *ngIf="canWatch()"
   */
  canAccess(productId: string): boolean {
    return isEntitled(this.entitlements(), productId);
  }

  /**
   * A computed signal factory that returns a readonly signal evaluating
   * entitlement for `productId`. Use this when you need a stable signal
   * reference (e.g. to pass to a child component's input).
   */
  canAccessSignal(productId: string) {
    return computed(() => isEntitled(this.entitlements(), productId));
  }
}
