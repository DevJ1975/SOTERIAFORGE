import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { STOREFRONT_ENV } from '../environments/storefront-environment';
import { requestAccessHref } from './core/catalog-data';

@Component({
  selector: 'assurance-storefront-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <header class="store-header" role="banner">
      <a routerLink="/" class="store-header__brand">Soteria Assurance</a>
      <button
        type="button"
        class="store-header__toggle"
        [attr.aria-expanded]="menuOpen()"
        aria-controls="store-nav"
        aria-label="Toggle navigation menu"
        (click)="toggleMenu()"
      >
        <span aria-hidden="true">☰</span>
      </button>
      <nav
        id="store-nav"
        class="store-header__nav"
        [class.store-header__nav--open]="menuOpen()"
        aria-label="Primary"
      >
        <a routerLink="/catalog" (click)="closeMenu()">Catalog</a>
        <a [href]="requestHref" (click)="closeMenu()">Request access</a>
      </nav>
    </header>
    <main id="main-content" tabindex="-1">
      <router-outlet />
    </main>
    <footer class="store-footer">
      <span>© {{ year }} Soteria Assurance</span>
      <span>Powered by Trainovation Technologies, LLC</span>
    </footer>
  `,
  styles: [
    `
      .skip-link {
        position: absolute;
        left: -999px;
        top: 0;
        background: #fff;
        color: #000;
        padding: 0.5rem 1rem;
        z-index: 100;
      }
      .skip-link:focus {
        left: 0;
      }
      .store-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: clamp(0.75rem, 3vw, 1rem) clamp(1rem, 4vw, 1.5rem);
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
      }
      .store-header__brand {
        font-weight: 700;
        font-size: clamp(1rem, 3.5vw, 1.25rem);
        color: #fff;
        text-decoration: none;
      }
      /* Hamburger toggle — visible only on narrow viewports. */
      .store-header__toggle {
        display: none;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        font-size: 1.25rem;
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
      }
      .store-header__nav {
        display: flex;
        align-items: center;
      }
      .store-header__nav a {
        display: inline-flex;
        align-items: center;
        /* >= 44px touch targets. */
        min-height: 44px;
        padding: 0 0.5rem;
        margin-left: 0.75rem;
        color: #fff;
        text-decoration: none;
      }
      @media (max-width: 40rem) {
        .store-header__toggle {
          display: inline-flex;
        }
        .store-header__nav {
          /* Collapse into a full-width stacked menu, hidden until toggled. */
          display: none;
          flex-direction: column;
          align-items: stretch;
          flex-basis: 100%;
          gap: 0.25rem;
        }
        .store-header__nav--open {
          display: flex;
        }
        .store-header__nav a {
          margin-left: 0;
          padding: 0 0.25rem;
          width: 100%;
          justify-content: flex-start;
        }
      }
      .store-footer {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.25rem 1rem;
        padding: clamp(1.5rem, 5vw, 2rem) 1.5rem;
        opacity: 0.7;
        text-align: center;
      }
    `,
  ],
})
export class AppComponent {
  protected readonly year = new Date().getFullYear();

  protected readonly requestHref = requestAccessHref(inject(STOREFRONT_ENV).contactEmail);

  /** Mobile nav menu visibility (only meaningful at narrow viewports). */
  protected readonly menuOpen = signal(false);

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
