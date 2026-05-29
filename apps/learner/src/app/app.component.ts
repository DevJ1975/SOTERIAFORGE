import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TenantService } from '@forge/auth';

@Component({
  selector: 'forge-learner-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="forge-shell">
      <header class="forge-shell__header">
        <span class="forge-shell__brand">Soteria FORGE</span>
        @if (tenant.tenantId(); as tid) {
          <span class="forge-shell__tenant">{{ tid }}</span>
        }
      </header>
      <router-outlet />
    </main>
  `,
  styles: [
    `
      .forge-shell__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1.25rem;
        background: var(--forge-primary, #0b5fff);
        color: #fff;
      }
      .forge-shell__brand {
        font-weight: 700;
      }
      .forge-shell__tenant {
        opacity: 0.85;
        text-transform: capitalize;
      }
    `,
  ],
})
export class AppComponent {
  protected readonly tenant = inject(TenantService);
}
