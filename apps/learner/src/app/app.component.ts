import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { TenantService } from '@assurance/auth';
import { OfflineXapiQueue } from '@assurance/standards';

@Component({
  selector: 'assurance-learner-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Skip link: visually hidden until focused; jumps keyboard users past nav -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <div class="assurance-shell">
      <header class="assurance-shell__header" role="banner">
        <span class="assurance-shell__brand">Soteria Assurance</span>
        @if (tenant.tenantId(); as tid) {
          <span class="assurance-shell__tenant" [attr.aria-label]="'Current tenant: ' + tid">{{
            tid
          }}</span>
        }
      </header>

      <main id="main-content" class="assurance-shell__main" tabindex="-1">
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
        text-transform: capitalize;
      }
      .assurance-shell__main {
        outline: none;
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

  constructor() {
    // Eagerly inject OfflineXapiQueue (browser only) so its window `online`
    // listener is registered for the lifetime of the app, enabling automatic
    // xAPI statement flush on reconnect.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      inject(OfflineXapiQueue);
    }
  }
}
