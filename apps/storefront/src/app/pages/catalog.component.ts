import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { CheckoutService } from '@forge/payments';

interface CatalogTile {
  productId: string;
  title: string;
  blurb: string;
  price: string;
}

@Component({
  selector: 'forge-catalog',
  standalone: true,
  imports: [CardModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="catalog">
      <h1>Catalog</h1>
      <div class="catalog__grid">
        @for (item of products(); track item.productId) {
          <p-card [header]="item.title">
            <p>{{ item.blurb }}</p>
            <div class="catalog__buy">
              <strong>{{ item.price }}</strong>
              <p-button label="Buy" (onClick)="buy(item.productId)" />
            </div>
          </p-card>
        }
      </div>
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
    `,
  ],
})
export class CatalogComponent {
  private readonly checkout = inject(CheckoutService);

  // Placeholder catalog (Phase 7 sources this SSR-side from /b2c/catalog for SEO).
  protected readonly products = signal<CatalogTile[]>([
    {
      productId: 'demo-osha-101',
      title: 'OSHA 101',
      blurb: 'Workplace safety fundamentals with interactive scenarios.',
      price: '$49',
    },
    {
      productId: 'demo-all-access',
      title: 'All-Access',
      blurb: 'Every course, updated continually. Monthly subscription.',
      price: '$29/mo',
    },
  ]);

  protected buy(productId: string): void {
    void this.checkout.startCheckout(productId);
  }
}
