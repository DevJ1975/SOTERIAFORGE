import {
  ChangeDetectionStrategy,
  Component,
  type Signal,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TenantService } from '@assurance/auth';
import { OfflineXapiQueue } from '@assurance/standards';
import { AssuranceBottomNavComponent, AssuranceOfflineBannerComponent } from '@assurance/ui';

@Component({
  selector: 'assurance-learner-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    AssuranceOfflineBannerComponent,
    AssuranceBottomNavComponent,
  ],
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

      <!-- Top navigation (visible on larger viewports; bottom-nav covers phones) -->
      <nav class="assurance-shell__topnav" aria-label="Primary">
        <a routerLink="/" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }"
          >Dashboard</a
        >
        <a routerLink="/courses" routerLinkActive="is-active">Courses</a>
        <a routerLink="/leaderboard" routerLinkActive="is-active">Leaderboard</a>
        <a routerLink="/tutor" routerLinkActive="is-active">Tutor</a>
      </nav>

      <!-- Offline connectivity banner (non-blocking, polite live region) -->
      <assurance-offline-banner [pendingCount]="pendingCount()" />

      <main id="main-content" class="assurance-shell__main" tabindex="-1">
        <router-outlet />
      </main>

      <footer class="assurance-shell__footer">
        <span>© {{ year }} Soteria Assurance</span>
        <span>Powered by Trainovation Technologies, LLC</span>
      </footer>

      <!-- Mobile bottom tab bar (CSS-gated to small viewports) -->
      <assurance-bottom-nav />
    </div>
  `,
  styles: [
    `
      .assurance-shell {
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
      }
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
      .assurance-shell__topnav {
        display: flex;
        gap: 1.25rem;
        padding: 0.5rem 1.25rem;
        border-bottom: 1px solid var(--assurance-border, #e5e7eb);
      }
      .assurance-shell__topnav a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 0.25rem;
        color: var(--assurance-text, #1f2937);
        text-decoration: none;
        font-size: 0.9375rem;
      }
      .assurance-shell__topnav a.is-active {
        color: var(--assurance-primary, #0b5fff);
        font-weight: 600;
        border-bottom: 2px solid var(--assurance-primary, #0b5fff);
      }
      /* On phones the bottom-nav is the primary nav; hide the top links. */
      @media (max-width: 48rem) {
        .assurance-shell__topnav {
          display: none;
        }
      }
      .assurance-shell__main {
        flex: 1;
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

  /** Pending offline xAPI statements, surfaced in the offline banner. */
  protected readonly pendingCount: Signal<number>;

  constructor() {
    // Eagerly inject OfflineXapiQueue (browser only) so its window `online`
    // listener is registered for the lifetime of the app, enabling automatic
    // xAPI statement flush on reconnect, and mirror its pending count for the
    // offline banner. On the server there is no queue → constant 0.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      this.pendingCount = inject(OfflineXapiQueue).pendingCount;
    } else {
      this.pendingCount = signal(0).asReadonly();
    }
  }
}
