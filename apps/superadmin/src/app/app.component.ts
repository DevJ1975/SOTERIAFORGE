import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserMenuComponent } from '@assurance/auth-ui';

@Component({
  selector: 'assurance-superadmin-root',
  standalone: true,
  imports: [RouterOutlet, UserMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main-content" class="assurance-shell__skip">Skip to main content</a>
    <div class="assurance-shell">
      <header class="assurance-shell__header" role="banner">
        <span class="assurance-shell__brand">Soteria Assurance</span>
        <span class="assurance-shell__tenant">Platform Admin</span>
        <span class="assurance-shell__spacer"></span>
        <assurance-user-menu redirectTo="/login" />
      </header>
      <main id="main-content" tabindex="-1">
        <router-outlet />
      </main>
      <footer class="assurance-shell__footer">
        <span>© {{ year }} Soteria Assurance</span>
        <span>Powered by Trainovation Technologies, LLC</span>
      </footer>
    </div>
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
      }
      .assurance-shell__spacer {
        flex: 1 1 auto;
      }
      .assurance-shell__skip {
        position: absolute;
        left: -999px;
        top: 0;
        background: #fff;
        color: #000;
        padding: 0.5rem 1rem;
        z-index: 100;
      }
      .assurance-shell__skip:focus {
        left: 0;
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
  protected readonly year = new Date().getFullYear();
}
