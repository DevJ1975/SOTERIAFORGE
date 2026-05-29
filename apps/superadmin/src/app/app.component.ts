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
        <span class="forge-shell__brand">Platform Admin</span>
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
    `,
  ],
})
export class AppComponent {}
