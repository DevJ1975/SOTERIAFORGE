import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ForgeEntitlements } from '@forge/payments';
import type { CatalogProduct } from '@forge/shared';
import { StoreCatalog } from '../store-catalog.service';

type LibraryState = 'loading' | 'ready' | 'error';

const GRANTS_LABEL: Record<CatalogProduct['grants']['kind'], string> = {
  course: 'Full course',
  module: 'Module',
  all_access: 'All access',
};

/**
 * The signed-in customer's library: live entitlements (ForgeEntitlements)
 * resolved against the catalog. Guarded by authGuard and client-rendered
 * only (RenderMode.Client) — it is meaningless without a browser session.
 */
@Component({
  selector: 'app-library-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="head">
        <h1>My Library</h1>
        <p>Everything you own, ready when you are.</p>
      </section>

      @switch (state()) {
        @case ('loading') {
          <div class="grid" aria-hidden="true">
            @for (skeleton of [0, 1]; track skeleton) {
              <article class="forge-card item">
                <div class="skeleton skeleton-line title"></div>
                <div class="skeleton skeleton-line short"></div>
              </article>
            }
          </div>
        }
        @case ('error') {
          <section class="forge-card empty-state">
            <h3>Couldn't load your library</h3>
            <p>Something went wrong talking to the store. Refresh to try again.</p>
          </section>
        }
        @case ('ready') {
          @if (items().length === 0) {
            <section class="forge-card empty-state">
              <h3>Your library is empty</h3>
              <p>Grab your first safety course and it will show up here, ready to launch.</p>
              <a class="cta" routerLink="/catalog">Browse the catalog</a>
            </section>
          } @else {
            <div class="grid">
              @for (item of items(); track item.id) {
                <article class="forge-card item">
                  <span class="chip">{{ grantsLabel(item) }}</span>
                  <h3>{{ item.title }}</h3>
                  <!-- TODO(domain-wiring Phase 8): href the learner app origin
                       (https://app.…/courses/...) once domains are wired. -->
                  <a class="open" href="#">Open in the learner portal</a>
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
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }

    .item {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .item h3 {
      margin: 0;
      flex: 1;
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

    .open {
      align-self: flex-start;
      font-weight: 600;
    }

    .empty-state {
      max-width: 560px;
    }

    .empty-state p {
      color: var(--forge-text-subtle);
      margin: 0 0 18px;
    }

    .cta {
      display: inline-block;
      padding: 10px 24px;
      border-radius: 22px;
      background: var(--forge-accent);
      color: #fff;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-decoration: none;
      transition: background 130ms ease-out;
    }

    .cta:hover {
      background: var(--forge-accent-hover);
      text-decoration: none;
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
export class LibraryPage {
  private readonly catalog = inject(StoreCatalog);
  private readonly entitlements = inject(ForgeEntitlements);

  protected readonly state = signal<LibraryState>('loading');
  protected readonly items = signal<CatalogProduct[]>([]);

  /** Guards re-resolving the same entitlement set on snapshot echoes. */
  private resolvedKey: string | null = null;

  constructor() {
    effect(() => {
      if (this.entitlements.status() !== 'ready') return;
      const ids = this.entitlements.entitlementIds();
      const key = [...ids].sort().join(',');
      if (this.resolvedKey === key) return;
      this.resolvedKey = key;
      void this.resolve(ids);
    });
  }

  protected grantsLabel(product: CatalogProduct): string {
    return GRANTS_LABEL[product.grants.kind];
  }

  private async resolve(productIds: readonly string[]): Promise<void> {
    if (productIds.length === 0) {
      this.items.set([]);
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    try {
      const products = await Promise.all(productIds.map((id) => this.catalog.getProduct(id)));
      this.items.set(products.filter((product): product is CatalogProduct => !!product));
      this.state.set('ready');
    } catch (error) {
      console.error('[storefront] failed to resolve the library', error);
      this.state.set('error');
    }
  }
}
