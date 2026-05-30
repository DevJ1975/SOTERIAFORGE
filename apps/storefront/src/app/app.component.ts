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
      <nav class="store-header__nav">
        <a routerLink="/catalog">Catalog</a>
        @if (authenticated()) {
          <a routerLink="/account">My learning</a>
          <button type="button" class="store-header__signout" (click)="signOut()">Sign out</button>
        } @else {
          <a routerLink="/auth">Sign in</a>
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
        padding: 1rem 1.5rem;
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
      }
      .store-header__brand {
        font-weight: 700;
        color: #fff;
        text-decoration: none;
      }
      .store-header__nav a {
        color: #fff;
        margin-left: 1.25rem;
        text-decoration: none;
      }
      .store-header__signout {
        background: none;
        border: none;
        color: #fff;
        margin-left: 1.25rem;
        cursor: pointer;
        font-size: inherit;
        padding: 0;
        text-decoration: none;
      }
      .store-footer {
        padding: 2rem 1.5rem;
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

  protected signOut(): void {
    void this.authSvc?.signOutUser().then(() => this.routerSvc?.navigate(['/']));
  }
}
