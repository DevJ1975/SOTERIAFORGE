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
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { CheckoutService } from '@assurance/payments';
import { CatalogRepository } from '@assurance/data-access';
import { ASSURANCE_ENV } from '@assurance/auth';
import type { CatalogProduct } from '@assurance/shared';
import { SeoService } from '../core/seo.service';

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

      <!--
        When Firebase is configured at render time the product list is fetched
        during SSR (so it appears in the server HTML for crawlers). Otherwise the
        server emits a shell and the browser hydrates the list. Both paths share
        the same markup below.
      -->
      @if (!isBrowser && !ssrData()) {
        <!-- SSR shell (no render-time Firebase config): hydrated in the browser -->
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
        margin: clamp(1.5rem, 5vw, 2rem) auto;
        padding: 0 1rem;
      }
      .catalog h1 {
        font-size: clamp(1.5rem, 5vw, 2.25rem);
        line-height: 1.2;
      }
      .catalog__grid {
        display: grid;
        /* Single column on the smallest phones (no card wider than the viewport);
           multi-column once there is room. min() keeps cards from overflowing at
           320px where 16rem + padding would exceed the width. */
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      @media (min-width: 30rem) {
        .catalog__grid {
          grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
        }
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
  private readonly seo = inject(SeoService);
  private readonly env = inject(ASSURANCE_ENV);

  /** Set to true only in the browser — safe to read in template. */
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * True when a real Firebase config is present at render time. Only then can the
   * catalog be safely read during SSR; with an empty apiKey any Firestore read
   * crashes the prerender with `auth/invalid-api-key`, so we must NOT attempt it.
   */
  private readonly firebaseConfigured = !!this.env.firebase?.apiKey?.trim();

  /** Set during SSR once the product list has been server-fetched (gated path). */
  protected readonly ssrData = signal(false);

  protected readonly products = signal<CatalogProduct[]>([]);
  protected readonly loading = signal(true);
  protected readonly lockedProductId = signal<string | null>(null);

  constructor() {
    // SEO tags are SSR-safe — Title/Meta + DOCUMENT write server-side too.
    this.seo.setSeo({
      title: 'Course Catalog — Soteria Assurance',
      description:
        'Browse ASSURANCE safety-training courses. One-time purchase or all-access subscription.',
      path: '/catalog',
      type: 'website',
    });

    if (this.isBrowser) {
      // Read query params synchronously from the snapshot (safe in constructor).
      const locked = this.route.snapshot.queryParamMap.get('locked');
      if (locked) {
        this.lockedProductId.set(locked);
      }

      // Browser hydration path (always available): fetch after first render.
      afterNextRender(() => {
        void this.loadProducts();
      });
    } else if (this.firebaseConfigured) {
      // SSR-dynamic-catalog (gated): when (and ONLY when) a real public Firebase
      // config exists at render time, fetch the product list during SSR so the
      // listings are in the server HTML for crawlers. The pending promise keeps
      // SSR awaiting the data. With an empty apiKey (the only mode verifiable in
      // this environment) we skip this entirely and rely on browser hydration —
      // see the note at the top of this file. Verifying real SSR of the product
      // list requires deploy-time read-only Firebase credentials we do not have.
      this.ssrData.set(true);
      void this.loadProducts();
    } else {
      // No render-time Firebase config: leave the SSR shell; the browser hydrates.
      this.loading.set(false);
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
