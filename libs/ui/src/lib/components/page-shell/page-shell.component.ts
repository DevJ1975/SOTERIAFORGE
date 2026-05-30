import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '../../theme.service';

/**
 * PageShellComponent — the top-level application layout shell.
 *
 * Renders a header containing the tenant logo (sourced from `ThemeService.tokens`)
 * and a main content area into which child routes / content are projected.
 *
 * @example
 * <assurance-page-shell>
 *   <router-outlet />
 * </assurance-page-shell>
 */
@Component({
  selector: 'assurance-page-shell',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }

      .assurance-shell-header {
        background: var(--assurance-color-primary, #1d4ed8);
        color: #fff;
        padding: 0 1.5rem;
        height: 3.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .assurance-shell-logo {
        height: 2rem;
        width: auto;
        object-fit: contain;
      }

      .assurance-shell-wordmark {
        font-family: var(--assurance-font-family, sans-serif);
        font-weight: 700;
        font-size: 1.125rem;
        letter-spacing: -0.01em;
      }

      .assurance-shell-body {
        flex: 1;
        background: var(--assurance-color-surface, #ffffff);
        color: var(--assurance-color-text, #111827);
        font-family: var(--assurance-font-family, sans-serif);
      }
    `,
  ],
  template: `
    <header class="assurance-shell-header" role="banner" aria-label="Application header">
      @if (tokens().logoUrl) {
        <img [src]="tokens().logoUrl" alt="Tenant logo" class="assurance-shell-logo" />
      } @else {
        <span class="assurance-shell-wordmark" aria-label="ASSURANCE">ASSURANCE</span>
      }
    </header>
    <main class="assurance-shell-body" id="main-content" tabindex="-1">
      <ng-content />
    </main>
  `,
})
export class PageShellComponent {
  protected readonly themeService = inject(ThemeService);

  /** Reactive design tokens from ThemeService. */
  readonly tokens = this.themeService.tokens;
}
