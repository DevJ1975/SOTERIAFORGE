import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="forge-card">
        <h1>FORGE Admin</h1>
        <p>Member management, course authoring, and publishing for your tenant.</p>
        <p class="phase">Arrives in Phase 2 — see ROADMAP.md for the delivery plan.</p>
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
