import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe, SlicePipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '@assurance/auth';
import { CheckoutService } from '@assurance/payments';
import { B2cCustomerRepository } from '@assurance/data-access';
import type { B2cCustomer } from '@assurance/shared';

// NOTE: All data fetching is browser-only. The server renders the page shell
// and SEO meta tags; the browser fetches the customer record after bootstrap.
// Full SSR with live customer data requires a real Firebase config at render
// time (deploy-time enhancement).

@Component({
  selector: 'forge-account',
  standalone: true,
  imports: [CardModule, ButtonModule, RouterLink, SlicePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="account">
      <h1>My Learning</h1>

      @if (!isBrowser) {
        <!-- SSR shell: account data is hydrated in the browser -->
        <p-card>
          <p>Loading account information&hellip;</p>
        </p-card>
      } @else if (!isSignedIn()) {
        <p-card>
          <p>
            Please <a routerLink="/auth">sign in</a> to view your purchased courses and manage your
            subscription.
          </p>
        </p-card>
      } @else if (loading()) {
        <p-card>
          <p>Loading account information&hellip;</p>
        </p-card>
      } @else if (!customer()) {
        <p-card>
          <p>No account record found. Complete a purchase to get started.</p>
          <p-button label="Browse catalog" routerLink="/catalog" styleClass="mt-2" />
        </p-card>
      } @else {
        <!-- Entitlements -->
        <p-card header="Your courses">
          @if (customer()!.entitlements.length === 0) {
            <p>You have no active entitlements yet.</p>
            <p-button label="Browse catalog" routerLink="/catalog" styleClass="mt-2" />
          } @else {
            <ul class="account__list">
              @for (e of customer()!.entitlements; track e) {
                <li>{{ e }}</li>
              }
            </ul>
          }
        </p-card>

        <!-- Purchase history -->
        @if (customer()!.purchaseHistory.length > 0) {
          <p-card header="Purchase history" styleClass="mt-3">
            <ul class="account__list">
              @for (p of customer()!.purchaseHistory; track p.stripeEventId) {
                <li>
                  {{ p.productId }} &mdash;
                  {{ p.at | slice: 0 : 10 }}
                  @if (p.amount != null) {
                    &mdash; {{ p.amount / 100 | number: '1.2-2' }} {{ p.currency?.toUpperCase() }}
                  }
                </li>
              }
            </ul>
          </p-card>
        }

        <!-- Billing portal -->
        <div class="account__actions">
          <p-button
            label="Manage subscription / billing"
            severity="secondary"
            (onClick)="openBillingPortal()"
          />
        </div>

        @if (checkoutService.lastError()) {
          <p class="account__error" role="alert">{{ checkoutService.lastError() }}</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .account {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .account__list {
        list-style: disc;
        padding-left: 1.25rem;
        margin: 0.5rem 0;
      }
      .account__actions {
        margin-top: 1.5rem;
      }
      .account__error {
        color: var(--red-600, #c0392b);
        margin-top: 1rem;
      }
    `,
  ],
})
export class AccountComponent {
  protected readonly checkoutService = inject(CheckoutService);
  private readonly auth = inject(AuthService);
  private readonly customerRepo = inject(B2cCustomerRepository);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  /** Set to true only in the browser — safe to read in the template. */
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly isSignedIn = signal(false);
  protected readonly loading = signal(true);
  protected readonly customer = signal<B2cCustomer | null>(null);

  constructor() {
    // SEO tags are SSR-safe.
    this.title.setTitle('My Learning — Soteria Assurance');
    this.meta.updateTag({
      name: 'description',
      content: 'View your purchased courses, entitlements, and manage your FORGE subscription.',
    });

    // All data fetching is browser-only to avoid Firebase calls during prerender.
    if (this.isBrowser) {
      afterNextRender(() => {
        void this.loadAccount();
      });
    }
  }

  private async loadAccount(): Promise<void> {
    this.loading.set(true);
    const principal = this.auth.principal();
    if (!principal) {
      this.isSignedIn.set(false);
      this.loading.set(false);
      return;
    }
    this.isSignedIn.set(true);
    try {
      const record = await this.customerRepo.getById(principal.uid);
      this.customer.set(record);
    } catch {
      // Fall back to null — the template handles the no-record state.
    } finally {
      this.loading.set(false);
    }
  }

  protected openBillingPortal(): void {
    void this.checkoutService.openBillingPortal();
  }
}
