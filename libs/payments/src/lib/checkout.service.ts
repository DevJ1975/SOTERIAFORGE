import { inject, Injectable, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

/** Lifecycle of a Stripe Checkout hand-off. */
export type CheckoutState = 'idle' | 'redirecting' | 'error';

/** Payload of the `createCheckoutSession` callable (see apps/functions). */
export interface CreateCheckoutSessionRequest {
  productId: string;
  successUrl: string;
  cancelUrl: string;
}

/** Response of the `createCheckoutSession` callable. */
export interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string;
  /**
   * True when the backend ran against the Stripe-less emulator: the
   * entitlement was already granted server-side and `url` is the successUrl
   * with `?emulated=1&product=...` appended.
   */
  emulated?: boolean;
}

export interface CheckoutUrls {
  successUrl: string;
  cancelUrl: string;
}

/**
 * Builds the storefront success/cancel return URLs for a checkout session.
 *
 * - success: `{origin}/thanks?product={productId}`
 * - cancel:  `{origin}/catalog?cancelled=1`
 */
export function buildCheckoutUrls(origin: string, productId: string): CheckoutUrls {
  const base = origin.replace(/\/+$/, '');
  return {
    successUrl: `${base}/thanks?product=${encodeURIComponent(productId)}`,
    cancelUrl: `${base}/catalog?cancelled=1`,
  };
}

/**
 * Stripe Checkout hand-off for the B2C storefront.
 *
 * `checkout(productId)` calls the `createCheckoutSession` Cloud Function with
 * success/cancel URLs derived from `location.origin`, then sends the browser
 * to the returned Stripe-hosted URL. Progress is surfaced via the `state`
 * signal ('idle' → 'redirecting' → leaves the page, or 'error').
 *
 * Browser-only by nature (it navigates `window.location`); on the server the
 * Functions injectable is absent and `checkout` settles in the 'error' state.
 */
@Injectable({ providedIn: 'root' })
export class ForgeCheckout {
  private readonly functions = inject(Functions, { optional: true });

  /** Current hand-off state. Stays 'redirecting' once navigation started. */
  readonly state = signal<CheckoutState>('idle');

  /** Human-readable message for the 'error' state, null otherwise. */
  readonly errorMessage = signal<string | null>(null);

  /**
   * Creates a checkout session for `productId` and redirects the browser to
   * Stripe. No-op while a previous hand-off is still in flight.
   */
  async checkout(productId: string): Promise<void> {
    if (this.state() === 'redirecting') return;
    this.errorMessage.set(null);
    this.state.set('redirecting');
    try {
      const session = await this.createSession({
        productId,
        ...buildCheckoutUrls(this.origin(), productId),
      });
      if (!session?.url) {
        throw new Error('createCheckoutSession returned no redirect URL.');
      }
      this.navigateTo(session.url);
    } catch (err) {
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Could not start checkout. Please try again.',
      );
      this.state.set('error');
    }
  }

  /** Clears an 'error' state back to 'idle' (e.g. for a retry button). */
  reset(): void {
    this.errorMessage.set(null);
    this.state.set('idle');
  }

  /** Seam for tests: wraps the Firebase callable. */
  protected createSession(
    data: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResponse> {
    if (!this.functions) {
      throw new Error('Firebase Functions is unavailable (provideForgeFirebase missing).');
    }
    const callable = httpsCallable<CreateCheckoutSessionRequest, CreateCheckoutSessionResponse>(
      this.functions,
      'createCheckoutSession',
    );
    return callable(data).then((result) => result.data);
  }

  /** Seam for tests: the storefront origin used for return URLs. */
  protected origin(): string {
    if (typeof location === 'undefined') {
      throw new Error('Checkout requires a browser context (location is undefined).');
    }
    return location.origin;
  }

  /** Seam for tests: full-page navigation to the Stripe-hosted checkout. */
  protected navigateTo(url: string): void {
    window.location.href = url;
  }
}
