import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Firestore, onSnapshot } from '@angular/fire/firestore';
import { PrincipalStore } from '@forge/auth';
import { b2cCustomerDoc } from '@forge/data-access';
import type { B2cCustomer } from '@forge/shared';

/** True when `customer` is entitled to `productId`. Null-safe. */
export function ownsProduct(
  customer: Pick<B2cCustomer, 'entitlements'> | null | undefined,
  productId: string,
): boolean {
  return !!customer?.entitlements.includes(productId);
}

/**
 * Live view of the signed-in customer's B2C entitlements.
 *
 * Watches `/b2c/store/customers/{uid}` (via {@link b2cCustomerDoc}) with
 * `onSnapshot`, re-targeting whenever the principal changes, so a purchase
 * completed by the Stripe webhook shows up in the UI without a reload.
 *
 * Claims advice: the backend also mirrors entitlements into the user's custom
 * claims, but the client token only picks that up on refresh — after a
 * purchase (i.e. on the /thanks page) call {@link refreshClaims} (a
 * passthrough to `PrincipalStore.refreshClaims()`) so guards and claim-based
 * checks see the new entitlement immediately.
 *
 * Browser-only: on the server (SSR) or without Firebase providers the service
 * settles immediately as 'ready' with no customer.
 */
@Injectable({ providedIn: 'root' })
export class ForgeEntitlements {
  private readonly db = inject(Firestore, { optional: true });
  private readonly principal = inject(PrincipalStore);
  private unsubscribe: (() => void) | null = null;

  /** 'loading' until the first snapshot (or signed-out state) settles. */
  readonly status = signal<'loading' | 'ready'>('loading');

  /** The customer's doc, or null when signed out / never purchased. */
  readonly customer = signal<B2cCustomer | null>(null);

  /** productIds the customer is entitled to. */
  readonly entitlementIds = computed(() => this.customer()?.entitlements ?? []);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || !this.db) {
      this.status.set('ready');
      return;
    }
    this.principal.init();
    effect(() => {
      const status = this.principal.status();
      if (status === 'loading') return; // auth not settled yet
      this.watch(status === 'signedIn' ? this.principal.uid() : null);
    });
  }

  /** Reactive ownership check (reads the `customer` signal). */
  owns(productId: string): boolean {
    return ownsProduct(this.customer(), productId);
  }

  /**
   * Forces an ID-token refresh so the server-side claims mirror (updated on
   * purchase) is visible client-side. Call this on the /thanks page.
   */
  refreshClaims(): Promise<void> {
    return this.principal.refreshClaims();
  }

  private watch(uid: string | null): void {
    this.stop();
    if (!uid || !this.db) {
      this.customer.set(null);
      this.status.set('ready');
      return;
    }
    this.unsubscribe = onSnapshot(
      b2cCustomerDoc(this.db, uid),
      (snapshot) => {
        this.customer.set(snapshot.exists() ? snapshot.data() : null);
        this.status.set('ready');
      },
      (error) => {
        console.error('[payments] failed to watch the customer doc', error);
        this.customer.set(null);
        this.status.set('ready');
      },
    );
  }

  private stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
