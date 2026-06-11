import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="forge-page">
      <section class="forge-card">
        <h1>FORGE Superadmin</h1>
        <p>Tenant provisioning, the global course library, and platform operations.</p>
        <p class="phase">Arrives in Phase 6 — see ROADMAP.md for the delivery plan.</p>
      </section>

      <a class="forge-card link-card" routerLink="/catalog">
        <h2>B2C Catalog</h2>
        <p>Curate the public storefront — products, Stripe prices, and publishing.</p>
        <span class="go">Open catalog <i class="pi pi-arrow-right"></i></span>
      </a>
    </div>
  `,
  styles: `
    .forge-page {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    p {
      color: var(--forge-text-subtle);
      max-width: 60ch;
    }

    .phase {
      font-weight: 600;
      color: var(--forge-accent);
    }

    .link-card {
      display: block;
      text-decoration: none;
      color: inherit;
      transition:
        border-color 130ms ease-out,
        background 130ms ease-out;

      &:hover {
        text-decoration: none;
        border-color: var(--forge-accent);
        background: color-mix(in srgb, var(--forge-accent) 4%, var(--forge-surface));
      }

      h2 {
        margin: 0 0 6px;
      }

      p {
        margin: 0 0 10px;
      }

      .go {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        color: var(--forge-accent);

        .pi {
          font-size: 12px;
        }
      }
    }
  `,
})
export class Home {}
