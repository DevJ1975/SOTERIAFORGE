import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from '@assurance/auth';

@Component({
  selector: 'assurance-storefront-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="store-header">
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
        @if (authenticated()) {
          <a routerLink="/account" (click)="closeMenu()">My learning</a>
          <button type="button" class="store-header__signout" (click)="signOut()">Sign out</button>
        } @else {
          <a routerLink="/auth" (click)="closeMenu()">Sign in</a>
        }
      </nav>
    </header>
    <router-outlet />
    <footer class="store-footer">
      <span>© {{ year }} Soteria Assurance</span>
      <span>Powered by Trainovation Technologies, LLC</span>
    </footer>
  `,
  styles: [
    `
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
      .store-header__nav a,
      .store-header__signout {
        display: inline-flex;
        align-items: center;
        /* >= 44px touch targets. */
        min-height: 44px;
        padding: 0 0.5rem;
        margin-left: 0.75rem;
        color: #fff;
        text-decoration: none;
      }
      .store-header__signout {
        background: none;
        border: none;
        cursor: pointer;
        font: inherit;
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
        .store-header__nav a,
        .store-header__signout {
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

  /** Always false on the server; updated reactively from Firebase auth in the browser. */
  protected readonly authenticated = signal(false);

  /** Mobile nav menu visibility (only meaningful at narrow viewports). */
  protected readonly menuOpen = signal(false);

  // Stored for signOut — only set in the browser.
  private authSvc?: AuthService;
  private routerSvc?: Router;

  constructor() {
    // inject() is valid inside the constructor (injection context).
    // We guard with isBrowser so that AuthService (and Firebase Auth) is never
    // instantiated during SSR prerender — avoiding auth/invalid-api-key crashes.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const auth = inject(AuthService);
      const router = inject(Router);
      this.authSvc = auth;
      this.routerSvc = router;
      toObservable(auth.isAuthenticated).subscribe((v) => this.authenticated.set(v));
    }
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected signOut(): void {
    this.closeMenu();
    void this.authSvc?.signOutUser().then(() => this.routerSvc?.navigate(['/']));
  }
}
