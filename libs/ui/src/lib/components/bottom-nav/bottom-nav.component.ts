import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** A single bottom-nav destination. */
export interface BottomNavItem {
  /** Router link target, e.g. '/courses'. */
  readonly link: string;
  /** Accessible label / visible text. */
  readonly label: string;
  /** Short emoji/glyph icon (decorative). */
  readonly icon: string;
  /** When true, only matches the exact route (use for the root '/' tab). */
  readonly exact?: boolean;
}

/** Default learner destinations: Dashboard / Courses / Leaderboard / Tutor. */
export const LEARNER_BOTTOM_NAV: readonly BottomNavItem[] = [
  { link: '/', label: 'Dashboard', icon: '🏠', exact: true },
  { link: '/courses', label: 'Courses', icon: '📚' },
  { link: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { link: '/tutor', label: 'Tutor', icon: '🤖' },
];

/**
 * AssuranceBottomNavComponent — responsive bottom tab bar for mobile (MO-03).
 *
 * Shown only on small viewports (`max-width: 48rem`) via CSS; hidden on larger
 * screens where a top/side nav is appropriate. Each tab is a router link with:
 *  - a touch target ≥ 44×44px,
 *  - `aria-current="page"` applied on the active route (driven by
 *    `routerLinkActive`), and
 *  - `env(safe-area-inset-bottom)` padding so it clears the iOS home indicator.
 *
 * Destinations default to {@link LEARNER_BOTTOM_NAV} but can be overridden.
 *
 * @example
 * <assurance-bottom-nav />
 */
@Component({
  selector: 'assurance-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="assurance-bottom-nav" [attr.aria-label]="ariaLabel()">
      <ul class="assurance-bottom-nav__list">
        @for (item of items(); track item.link) {
          <li class="assurance-bottom-nav__item">
            <a
              class="assurance-bottom-nav__link"
              [routerLink]="item.link"
              routerLinkActive="assurance-bottom-nav__link--active"
              #rla="routerLinkActive"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              [attr.aria-current]="rla.isActive ? 'page' : null"
            >
              <span class="assurance-bottom-nav__icon" aria-hidden="true">{{ item.icon }}</span>
              <span class="assurance-bottom-nav__label">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: [
    `
      .assurance-bottom-nav {
        display: none;
      }
      @media (max-width: 48rem) {
        .assurance-bottom-nav {
          display: block;
          position: sticky;
          bottom: 0;
          z-index: 50;
          background: #fff;
          border-top: 1px solid var(--assurance-border, #e5e7eb);
          /* Clear the iOS home indicator. */
          padding-bottom: env(safe-area-inset-bottom, 0);
        }
      }
      .assurance-bottom-nav__list {
        display: flex;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .assurance-bottom-nav__item {
        flex: 1 1 0;
      }
      .assurance-bottom-nav__link {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.125rem;
        /* >= 44px touch target. */
        min-height: 48px;
        padding: 0.375rem 0.25rem;
        color: var(--assurance-text-muted, #6b7280);
        text-decoration: none;
        font-size: 0.6875rem;
      }
      .assurance-bottom-nav__link--active {
        color: var(--assurance-primary, #0b5fff);
        font-weight: 600;
      }
      .assurance-bottom-nav__icon {
        font-size: 1.125rem;
        line-height: 1;
      }
      .assurance-bottom-nav__link:focus-visible {
        outline: 2px solid var(--assurance-primary, #0b5fff);
        outline-offset: -2px;
      }
    `,
  ],
})
export class AssuranceBottomNavComponent {
  /** Destinations to render; defaults to the standard learner set. */
  readonly items = input<readonly BottomNavItem[]>(LEARNER_BOTTOM_NAV);

  /**
   * Accessible label for the `<nav>` landmark. Defaults to "Primary mobile" so
   * it stays distinct from a desktop top-nav also labelled "Primary" (landmarks
   * must be uniquely labelled even when CSS hides one).
   */
  readonly ariaLabel = input<string>('Primary mobile');
}
