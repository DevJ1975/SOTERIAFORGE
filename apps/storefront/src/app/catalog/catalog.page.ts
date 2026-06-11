import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PrincipalStore } from '@forge/auth';
import { ForgeCheckout, ForgeEntitlements } from '@forge/payments';
import type { CatalogProduct } from '@forge/shared';
import { excerptOf, StoreCatalog } from '../store-catalog.service';

type CatalogState = 'loading' | 'ready' | 'error';

const GRANTS_LABEL: Record<CatalogProduct['grants']['kind'], string> = {
  course: 'Full course',
  module: 'Module',
  all_access: 'All access',
};

/**
 * Public storefront catalog: every PUBLISHED product from /b2c/store/catalog.
 *
 * SSR trade-off (Phase 5): the server bootstrap carries no Firebase, so the
 * server render emits the crawlable marketing shell only — hero copy,
 * headings and loading skeletons — and the product grid streams in after
 * hydration via a browser-gated Firestore read (`isPlatformBrowser`). Full
 * data-SSR for product cards (e.g. Firestore REST reads on the server, or
 * build-time snapshotting) is a Phase 8 follow-up; until then crawlers index
 * the page-level marketing content but not individual product cards.
 *
 * Prices are deliberately absent: pricing lives in Stripe (stripePriceId) and
 * is shown on the Stripe-hosted checkout page.
 */
@Component({
  selector: 'app-catalog-page',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="head">
        <h1>Course catalog</h1>
        <p>
          Field-tested safety training, built in Forge Studio. Buy a course once and it's yours —
          games, badges and all.
        </p>
      </section>

      @if (cancelled()) {
        <p class="banner notice" role="status">
          Checkout cancelled — no charge was made. Pick up where you left off whenever you're ready.
        </p>
      }
      @if (checkout.state() === 'error' && checkout.errorMessage(); as message) {
        <p class="banner error" role="alert">{{ message }}</p>
      }

      @switch (state()) {
        @case ('loading') {
          <div class="grid" aria-hidden="true">
            @for (skeleton of [0, 1, 2]; track skeleton) {
              <article class="forge-card product-card">
                <div class="skeleton skeleton-line title"></div>
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line short"></div>
              </article>
            }
          </div>
        }
        @case ('error') {
          <section class="forge-card empty-state">
            <h3>Couldn't load the catalog</h3>
            <p>Something went wrong talking to the store. Refresh to try again.</p>
          </section>
        }
        @case ('ready') {
          @if (products().length === 0) {
            <section class="forge-card empty-state">
              <h3>Nothing on the shelves yet</h3>
              <p>New safety courses are on the way — check back soon.</p>
            </section>
          } @else {
            <div class="grid">
              @for (product of products(); track product.id) {
                <article class="forge-card product-card">
                  <span class="chip" [class.all-access]="product.grants.kind === 'all_access'">
                    {{ grantsLabel(product) }}
                  </span>
                  <h3>{{ product.title }}</h3>
                  @if (product.description) {
                    <p class="excerpt">{{ excerpt(product) }}</p>
                  }
                  @if (entitlements.owns(product.id)) {
                    <p class="owned">In your library &#10003;</p>
                  } @else {
                    <div class="buy-row">
                      <p-button
                        [label]="checkout.state() === 'redirecting' ? 'Redirecting…' : 'Buy'"
                        [disabled]="checkout.state() === 'redirecting'"
                        (onClick)="buy(product.id)"
                      />
                      <span class="microcopy">Price shown at checkout</span>
                    </div>
                  }
                </article>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .head {
      margin-bottom: 24px;
    }

    .head p {
      color: var(--forge-text-subtle);
      margin: 0;
      max-width: 60ch;
    }

    .banner {
      border-radius: var(--forge-radius);
      padding: 12px 16px;
      margin: 0 0 20px;
      font-weight: 600;
    }

    .banner.notice {
      background: color-mix(in srgb, var(--forge-notice) 12%, white);
      color: var(--forge-notice);
      border: 1px solid var(--forge-notice);
    }

    .banner.error {
      background: color-mix(in srgb, var(--forge-negative) 10%, white);
      color: var(--forge-negative);
      border: 1px solid var(--forge-negative);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }

    .product-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition:
        transform 130ms ease-out,
        box-shadow 130ms ease-out;
    }

    .product-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--forge-shadow-elevated);
    }

    .product-card h3 {
      margin: 0;
    }

    .chip {
      align-self: flex-start;
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: var(--forge-surface-dim);
      border: 1px solid var(--forge-border);
      color: var(--forge-text-subtle);
    }

    .chip.all-access {
      background: var(--forge-accent);
      border-color: var(--forge-accent);
      color: #fff;
    }

    .excerpt {
      color: var(--forge-text-subtle);
      margin: 0;
      flex: 1;
    }

    .owned {
      margin: 0;
      color: var(--forge-positive);
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 12px;
    }

    .buy-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .microcopy {
      font-size: 12px;
      color: var(--forge-text-subtle);
    }

    .empty-state {
      max-width: 560px;
    }

    .empty-state p {
      color: var(--forge-text-subtle);
      margin: 0;
    }

    .skeleton {
      background: linear-gradient(
        100deg,
        var(--forge-surface-dim) 40%,
        var(--forge-border) 50%,
        var(--forge-surface-dim) 60%
      );
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }

    .skeleton-line {
      height: 14px;
      border-radius: var(--forge-radius-small);
    }

    .skeleton-line.title {
      height: 20px;
      width: 65%;
    }

    .skeleton-line.short {
      width: 40%;
    }

    @keyframes shimmer {
      to {
        background-position: -200% 0;
      }
    }
  `,
})
export class CatalogPage {
  private readonly catalog = inject(StoreCatalog);
  private readonly principal = inject(PrincipalStore);
  private readonly router = inject(Router);
  protected readonly checkout = inject(ForgeCheckout);
  protected readonly entitlements = inject(ForgeEntitlements);

  protected readonly state = signal<CatalogState>('loading');
  protected readonly products = signal<CatalogProduct[]>([]);
  /** True when returning from a cancelled Stripe Checkout (?cancelled=1). */
  protected readonly cancelled = signal(false);

  constructor() {
    this.principal.init();
    this.cancelled.set(inject(ActivatedRoute).snapshot.queryParamMap.get('cancelled') === '1');
    // Browser-only data load; the server render keeps the 'loading' skeleton
    // shell (see the class docblock for the SSR trade-off).
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      void this.load();
    }
  }

  protected grantsLabel(product: CatalogProduct): string {
    return GRANTS_LABEL[product.grants.kind];
  }

  protected excerpt(product: CatalogProduct): string {
    return excerptOf(product.description);
  }

  /** Buy: signed-out users detour to /login and come back to the catalog. */
  protected buy(productId: string): void {
    if (this.principal.status() !== 'signedIn') {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/catalog' } });
      return;
    }
    void this.checkout.checkout(productId);
  }

  private async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.products.set(await this.catalog.listPublished());
      this.state.set('ready');
    } catch (error) {
      console.error('[storefront] failed to load the catalog', error);
      this.state.set('error');
    }
  }
}
