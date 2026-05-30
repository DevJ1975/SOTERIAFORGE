import { ChangeDetectionStrategy, Component, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { TenantService } from '@forge/auth';
import { OfflineXapiQueue } from '@forge/standards';

@Component({
  selector: 'forge-learner-root',
  standalone: true,
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Skip link: visually hidden until focused; jumps keyboard users past nav -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <div class="forge-shell">
      <header class="forge-shell__header" role="banner">
        <span class="forge-shell__brand">Soteria Assurance</span>
        @if (tenant.tenantId(); as tid) {
          <span class="forge-shell__tenant" [attr.aria-label]="'Current tenant: ' + tid">{{
            tid
          }}</span>
        }
      </header>

      <main id="main-content" class="forge-shell__main" tabindex="-1">
        <router-outlet />
      </main>

      <footer class="forge-shell__footer">
        <span>© {{ year }} Soteria Assurance</span>
        <span>Powered by Trainovation Technologies, LLC</span>
      </footer>
    </div>
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
      .forge-shell__main {
        outline: none;
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
