import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="forge-card">
        <h1>Soteria FORGE Store</h1>
        <p>Browse and purchase safety courses — one-time or all-access subscription.</p>
        <p class="phase">Arrives in Phase 5 — see ROADMAP.md for the delivery plan.</p>
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
  `,
})
export class Home {}
