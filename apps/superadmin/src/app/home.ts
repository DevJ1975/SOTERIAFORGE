import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="forge-card">
        <h1>FORGE Superadmin</h1>
        <p>Tenant provisioning, the global course library, and platform operations.</p>
        <p class="phase">Arrives in Phase 6 — see ROADMAP.md for the delivery plan.</p>
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
