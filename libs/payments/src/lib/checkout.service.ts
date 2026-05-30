import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

/**
 * SECURITY NOTE — entitlements are NEVER granted by the client.
 *
 * `startCheckout` initiates a Stripe Checkout session via a server-side
 * Cloud Function. The function returns a Stripe-hosted URL; the browser is
 * then redirected there.
 *
 * After a successful payment Stripe sends a signed webhook to the server.
 * The webhook Cloud Function verifies the event, records the purchase, and
 * THEN writes the entitlement to Firestore + Firebase custom claims.
 *
 * The client NEVER sets entitlement state. Gating must be enforced at:
 *   a) route guard level (using EntitlementStore / AuthService claims), AND
 *   b) content-delivery level (Firestore security rules / Cloud Function auth).
 */
@Injectable({ providedIn: 'root' })
export class CheckoutService {
  // Optional so the service is SSR-safe: Firebase Functions is a browser-only
  // feature and `provideFunctions` is deliberately omitted from the server
  // config. All call sites guard with isPlatformBrowser before invoking.
  private readonly functions = inject(Functions, { optional: true });
  private readonly document = inject(DOCUMENT);

  /** Tracks the last checkout/portal error. Null when no error has occurred. */
  readonly lastError = signal<string | null>(null);

  /**
   * Initiates a Stripe Checkout session for the given `productId`.
   *
   * Calls the `createCheckoutSession` Firebase callable function, which looks
   * up the Stripe price id server-side and returns a one-time Stripe-hosted
   * checkout URL. The browser is redirected to that URL.
   *
   * On failure the error is captured in `lastError` and not re-thrown, so the
   * caller can react to the signal without try/catch boilerplate.
   */
  async startCheckout(productId: string): Promise<void> {
    this.lastError.set(null);
    if (!this.functions) return; // no-op on the server (Functions not provided)
    try {
      const fn = httpsCallable<{ productId: string }, { url: string }>(
        this.functions,
        'createCheckoutSession',
      );
      const result = await fn({ productId });
      this.document.location.assign(result.data.url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Checkout failed. Please try again.';
      this.lastError.set(message);
    }
  }

  /**
   * Opens the Stripe Billing Portal for the authenticated customer.
   *
   * Calls the `createBillingPortalSession` Firebase callable function, which
   * looks up the customer's Stripe customer id server-side and returns a
   * short-lived portal URL. The browser is redirected to that URL.
   *
   * On failure the error is captured in `lastError`.
   */
  async openBillingPortal(): Promise<void> {
    this.lastError.set(null);
    if (!this.functions) return; // no-op on the server (Functions not provided)
    try {
      const fn = httpsCallable<Record<string, never>, { url: string }>(
        this.functions,
        'createBillingPortalSession',
      );
      const result = await fn({});
      this.document.location.assign(result.data.url);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Could not open billing portal. Please try again.';
      this.lastError.set(message);
    }
  }
}
