import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { CheckoutService } from '@assurance/payments';
import { CatalogRepository } from '@assurance/data-access';
import type { CatalogProduct } from '@assurance/shared';

// NOTE: True SSR-for-SEO with live product data requires a real Firebase config
// at build/render time (deploy-time enhancement). In the current setup the
// environment has an empty apiKey so ANY Firestore read during prerender would
// crash with auth/invalid-api-key. The server renders the page shell + SEO meta
// tags; the browser fetches and hydrates the product list after bootstrap.

@Component({
  selector: 'assurance-catalog',
  standalone: true,
  imports: [CardModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Purchase-required banner when redirected back after an entitlement gate -->
    @if (lockedProductId()) {
      <div class="catalog__banner" role="alert">
        <strong>Purchase required.</strong> Please purchase the product below to continue.
      </div>
    }

    <section class="catalog">
      <h1>Course Catalog</h1>

      @if (!isBrowser) {
        <!-- SSR shell: product list is hydrated in the browser -->
        <p class="catalog__loading">Loading courses&hellip;</p>
      } @else {
        @if (loading()) {
          <p class="catalog__loading">Loading courses&hellip;</p>
        } @else if (products().length === 0) {
          <p class="catalog__empty">No courses are available at this time.</p>
        } @else {
          <div class="catalog__grid">
            @for (product of products(); track product.id) {
              <p-card [header]="product.title">
                <p>{{ product.description }}</p>
                <div class="catalog__buy">
                  <span class="catalog__mode">
                    {{ product.mode === 'subscription' ? 'Subscription' : 'One-time purchase' }}
                  </span>
                  <p-button label="Buy" (onClick)="buy(product.id)" />
                </div>
              </p-card>
            }
          </div>
        }

        @if (checkoutService.lastError()) {
          <p class="catalog__error" role="alert">{{ checkoutService.lastError() }}</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .catalog {
        max-width: 64rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .catalog__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
        gap: 1rem;
      }
      .catalog__buy {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 1rem;
      }
      .catalog__mode {
        font-size: 0.875rem;
        opacity: 0.7;
      }
      .catalog__loading,
      .catalog__empty {
        color: var(--text-color-secondary, #6c757d);
        margin-top: 1rem;
      }
      .catalog__error {
        color: var(--red-600, #c0392b);
        margin-top: 1rem;
      }
      .catalog__banner {
        background: var(--yellow-100, #fffde7);
        border-left: 4px solid var(--yellow-600, #f9a825);
        padding: 0.75rem 1rem;
        margin-bottom: 1rem;
      }
    `,
  ],
})
export class CatalogComponent {
  protected readonly checkoutService = inject(CheckoutService);
  private readonly catalogRepo = inject(CatalogRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  /** Set to true only in the browser — safe to read in template. */
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly products = signal<CatalogProduct[]>([]);
  protected readonly loading = signal(true);
  protected readonly lockedProductId = signal<string | null>(null);

  constructor() {
    // SEO tags are SSR-safe — Title/Meta write to the document server-side too.
    this.title.setTitle('Course Catalog — Soteria Assurance');
    this.meta.updateTag({
      name: 'description',
      content:
        'Browse ASSURANCE safety-training courses. One-time purchase or all-access subscription.',
    });

    // All data fetching is browser-only to avoid Firebase calls during prerender.
    if (this.isBrowser) {
      // Read query params synchronously from the snapshot (safe in constructor).
      const locked = this.route.snapshot.queryParamMap.get('locked');
      if (locked) {
        this.lockedProductId.set(locked);
      }

      afterNextRender(() => {
        void this.loadProducts();
      });
    }
  }

  private async loadProducts(): Promise<void> {
    this.loading.set(true);
    try {
      const items = await this.catalogRepo.listPublished();
      this.products.set(items);
    } catch {
      // Silently fall back to an empty list; the Buy button is hidden.
    } finally {
      this.loading.set(false);
    }
  }

  protected buy(productId: string): void {
    void this.checkoutService.startCheckout(productId);
  }
}
