import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="forge-card">
        <h1>Soteria FORGE Store</h1>
        <p>Browse and purchase safety courses — one-time or all-access subscription.</p>
        <p class="phase">Arrives in Phase 5 — see ROADMAP.md for the delivery plan.</p>
        <p class="trust-cta">
          Evaluating us for enterprise use?
          <a routerLink="/trust">Read our Trust &amp; Security overview</a>.
        </p>
      </section>
    </div>
  `,
  styles: `
    p {
      color: var(--forge-text-subtle);
      max-width: 60ch;
    }

    .phase {
      font-weight: 600;
      color: var(--forge-accent);
    }

    .trust-cta {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--forge-border);
    }
  `,
})
export class Home {}
