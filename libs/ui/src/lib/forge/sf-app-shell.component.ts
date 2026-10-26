import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SF_ASSET_BASE_URL, SfIconComponent, type SfIconName } from './sf-icon.component';

/** One destination in the icon rail (bottom tab bar on phones). */
export interface SfNavItem {
  /** Router link target, e.g. `/courses`. */
  readonly link: string;
  /** Accessible name; also the visible label on the phone tab bar. */
  readonly label: string;
  /** Kit icon. */
  readonly icon: SfIconName;
  /** Match the route exactly (use for `/`). */
  readonly exact?: boolean;
}

/** One breadcrumb segment. The last segment is the current page. */
export interface SfCrumb {
  readonly label: string;
  readonly link?: string;
}

export type SfShellVariant = 'light' | 'dark';

/** The learner rail from SFG-SPC-FRG-011: Home, Courses, Engage, Progress, Analytics, History. */
export const FORGE_LEARNER_NAV: readonly SfNavItem[] = [
  { link: '/', label: 'Home', icon: 'home', exact: true },
  { link: '/courses', label: 'Courses', icon: 'courses' },
  { link: '/engage', label: 'Engage', icon: 'engage' },
  { link: '/progress', label: 'Progress', icon: 'progress-star' },
  { link: '/analytics', label: 'Analytics', icon: 'analytics' },
  { link: '/history', label: 'History', icon: 'history' },
];

/** Up to two initials from a display name ("Marcus Walker" → "MW"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * `<sf-app-shell>` — the Soteria Forge application frame.
 *
 * - 88 px charcoal icon rail: shield (home link), nav items, avatar pinned to
 *   the bottom. Active item = charcoal tile + 3 px ember bar (`aria-current="page"`).
 *   Every icon link carries an `aria-label`.
 * - 64 px white top bar: breadcrumb, search, streak pill, learner name + avatar.
 * - Cream canvas with a single `<main id="main-content">` and a skip link.
 * - ≤ 48rem: the rail becomes a bottom tab bar (one `<nav>` landmark, restyled),
 *   search collapses, and the shield moves into the top bar.
 * - `variant="dark"` is the Forge Engage hook (dark canvas and bars; PrimeNG's
 *   dark scheme is keyed to the same `.sf-shell--dark` class).
 *
 * Styles live in `libs/ui/src/styles/forge/forge-shell.css` (global, loaded
 * with the kit) so the `sf-*` class names stay identical to the kit.
 *
 * Slots: `[sfTopbarEnd]` (e.g. a sign-out control), default slot = page content.
 */
@Component({
  selector: 'sf-app-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, SfIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sf-shell',
    '[class.sf-shell--dark]': "variant() === 'dark'",
  },
  template: `
    <a class="sf-skip-link" href="#main-content">Skip to main content</a>

    <nav class="sf-rail sf-shell__rail" [attr.aria-label]="navLabel()">
      <a class="sf-shell__brand" [routerLink]="homeLink()" [attr.aria-label]="brandName() + ' home'">
        <img class="sf-shell__shield" [src]="shieldSrc()" alt="" width="36" height="40" />
      </a>
      <ul class="sf-shell__nav" role="list">
        @for (item of navItems(); track item.link) {
          <li>
            <a
              class="sf-rail__item"
              [routerLink]="item.link"
              routerLinkActive
              #rla="routerLinkActive"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              [attr.aria-current]="rla.isActive ? 'page' : null"
              [attr.aria-label]="item.label"
              [attr.title]="item.label"
            >
              <sf-icon [name]="item.icon" />
              <span class="sf-shell__tab-label" aria-hidden="true">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
      @if (initials()) {
        <span class="sf-avatar sf-shell__rail-avatar" aria-hidden="true">{{ initials() }}</span>
      }
    </nav>

    <div class="sf-shell__body">
      <header class="sf-topbar sf-shell__topbar">
        <img class="sf-shell__topbar-shield" [src]="shieldSrc()" alt="" width="24" height="27" />
        <nav class="sf-shell__crumbs" aria-label="Breadcrumb">
          <ol>
            @for (crumb of crumbs(); track $index; let last = $last) {
              <li>
                @if (crumb.link && !last) {
                  <a [routerLink]="crumb.link">{{ crumb.label }}</a>
                } @else {
                  <span [attr.aria-current]="last ? 'page' : null">{{ crumb.label }}</span>
                }
              </li>
            }
          </ol>
        </nav>

        <form class="sf-shell__search" role="search" (submit)="onSearch($event, q.value)">
          <label class="sf-visually-hidden" for="sf-shell-search">{{ searchPlaceholder() }}</label>
          <sf-icon class="sf-shell__search-icon" name="search" size="sm" />
          <input
            #q
            id="sf-shell-search"
            class="sf-input sf-search"
            type="search"
            name="q"
            autocomplete="off"
            [placeholder]="searchPlaceholder()"
          />
        </form>

        @if (streakDays() !== null) {
          <span class="sf-pill sf-shell__streak">
            <sf-icon name="flame" size="sm" />
            <span
              >{{ streakDays() }}<span class="sf-shell__streak-unit">-day streak</span
              ><span class="sf-visually-hidden sf-shell__streak-sr"> day streak</span></span
            >
          </span>
        }

        @if (userName()) {
          <span class="sf-shell__user">
            <span class="sf-shell__uname">{{ userName() }}</span>
            <span class="sf-avatar" aria-hidden="true">{{ initials() }}</span>
          </span>
        }
        <ng-content select="[sfTopbarEnd]" />
      </header>

      <main id="main-content" class="sf-shell__main" tabindex="-1">
        <ng-content />
      </main>
    </div>
  `,
})
export class SfAppShellComponent {
  private readonly assetBase = inject(SF_ASSET_BASE_URL);

  /** Rail destinations. Defaults to the learner set. */
  readonly navItems = input<readonly SfNavItem[]>(FORGE_LEARNER_NAV);
  /** Accessible name of the primary navigation landmark. */
  readonly navLabel = input<string>('Primary');
  /** Breadcrumb trail; the last segment is the current page. */
  readonly crumbs = input<readonly SfCrumb[]>([]);
  /** Learner display name for the top bar; empty hides name + avatar. */
  readonly userName = input<string>('');
  /** Current streak in days; `null` hides the streak pill. */
  readonly streakDays = input<number | null>(null);
  readonly searchPlaceholder = input<string>('Search modules, labs, job aids');
  /** `dark` = Forge Engage (live class) surfaces. */
  readonly variant = input<SfShellVariant>('light');
  readonly brandName = input<string>('Soteria Forge');
  readonly homeLink = input<string>('/');

  /** Emits the trimmed query when the learner submits the search form. */
  readonly search = output<string>();

  protected readonly initials = computed(() => initialsOf(this.userName()));
  protected readonly shieldSrc = computed(() => `${this.assetBase}/logo/forge-shield.svg`);

  protected onSearch(event: Event, query: string): void {
    event.preventDefault();
    const q = query.trim();
    if (q) this.search.emit(q);
  }
}
