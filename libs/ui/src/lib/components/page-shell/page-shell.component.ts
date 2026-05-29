import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { ThemeService } from '../../theme.service';

/**
 * PageShellComponent — the top-level application layout shell.
 *
 * Renders a header containing the tenant logo (sourced from `ThemeService.tokens`)
 * and a main content area into which child routes / content are projected.
 *
 * @example
 * <forge-page-shell>
 *   <router-outlet />
 * </forge-page-shell>
 */
@Component({
  selector: 'forge-page-shell',
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

      .forge-shell-header {
        background: var(--forge-color-primary, #1d4ed8);
        color: #fff;
        padding: 0 1.5rem;
        height: 3.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .forge-shell-logo {
        height: 2rem;
        width: auto;
        object-fit: contain;
      }

      .forge-shell-wordmark {
        font-family: var(--forge-font-family, sans-serif);
        font-weight: 700;
        font-size: 1.125rem;
        letter-spacing: -0.01em;
      }

      .forge-shell-body {
        flex: 1;
        background: var(--forge-color-surface, #ffffff);
        color: var(--forge-color-text, #111827);
        font-family: var(--forge-font-family, sans-serif);
      }
    `,
  ],
  template: `
    <header class="forge-shell-header">
      @if (tokens().logoUrl) {
        <img
          [src]="tokens().logoUrl"
          alt="Tenant logo"
          class="forge-shell-logo"
        />
      } @else {
        <span class="forge-shell-wordmark">FORGE</span>
      }
    </header>
    <main class="forge-shell-body">
      <ng-content />
    </main>
  `,
})
export class PageShellComponent {
  protected readonly themeService = inject(ThemeService);

  /** Reactive design tokens from ThemeService. */
  readonly tokens = this.themeService.tokens;
}
