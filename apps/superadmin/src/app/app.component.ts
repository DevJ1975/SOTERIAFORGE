import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'forge-superadmin-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="forge-shell">
      <header class="forge-shell__header">
        <span class="forge-shell__brand">Soteria Assurance</span>
        <span class="forge-shell__tenant">Platform Admin</span>
      </header>
      <router-outlet />
      <footer class="forge-shell__footer">
        <span>© {{ year }} Soteria Assurance</span>
        <span>Powered by Trainovation Technologies, LLC</span>
      </footer>
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
      }
      .forge-shell__footer {
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
  protected readonly year = new Date().getFullYear();
}
