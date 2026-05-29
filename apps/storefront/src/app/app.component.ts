import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'forge-storefront-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="store-header">
      <a routerLink="/" class="store-header__brand">Soteria FORGE</a>
      <nav class="store-header__nav">
        <a routerLink="/catalog">Catalog</a>
        <a routerLink="/account">My learning</a>
      </nav>
    </header>
    <router-outlet />
    <footer class="store-footer">
      <span>© Soteria FORGE — verifiable, AI-grounded training.</span>
    </footer>
  `,
  styles: [
    `
      .store-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.5rem;
        background: var(--forge-primary, #0b5fff);
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
      .store-footer {
        padding: 2rem 1.5rem;
        opacity: 0.7;
        text-align: center;
      }
    `,
  ],
})
export class AppComponent {}
