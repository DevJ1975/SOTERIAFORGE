import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TenantService } from '@assurance/auth';

@Component({
  selector: 'assurance-admin-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="assurance-shell">
      <header class="assurance-shell__header">
        <span class="assurance-shell__brand">Soteria Assurance</span>
        @if (tenant.tenantId(); as tid) {
          <span class="assurance-shell__tenant">Admin · {{ tid }}</span>
        }
      </header>
      <router-outlet />
      <footer class="assurance-shell__footer">
        <span>© {{ year }} Soteria Assurance</span>
        <span>Powered by Trainovation Technologies, LLC</span>
      </footer>
    </main>
  `,
  styles: [
    `
      .assurance-shell__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1.25rem;
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
      }
      .assurance-shell__brand {
        font-weight: 700;
      }
      .assurance-shell__tenant {
        opacity: 0.85;
        text-transform: capitalize;
      }
      .assurance-shell__footer {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 1rem;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        margin-top: 2rem;
        border-top: 1px solid #e5e7eb;
        color: #6b7280;
        font-size: 0.8125rem;
      }
    `,
  ],
})
export class AppComponent {
  protected readonly tenant = inject(TenantService);
  protected readonly year = new Date().getFullYear();
}
