import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  computed,
  inject,
  input,
} from '@angular/core';

/** Every icon in the Soteria Forge kit sprite (`icons/_sprite.svg`, ids are `sf-<name>`). */
export const SF_ICON_NAMES = [
  'home',
  'courses',
  'engage',
  'progress-star',
  'analytics',
  'history',
  'search',
  'mic',
  'video',
  'share-screen',
  'raise-hand',
  'react',
  'ask-forge-sparkle',
  'send',
  'check',
  'play',
  'badge-recruit',
  'badge-operator',
  'badge-analyst',
  'badge-shield',
  'badge-shield-check',
  'lock',
  'flame',
  'clock',
  'users-crew',
  'file-pdf',
  'arrow-right',
  'close',
] as const;

export type SfIconName = (typeof SF_ICON_NAMES)[number];

/**
 * Base URL of the Forge kit assets (icons, logo). Apps copy
 * `libs/ui/src/assets/forge` to `assets/forge` via their project.json `assets`,
 * so the relative default resolves against `<base href>`.
 */
export const SF_ASSET_BASE_URL = new InjectionToken<string>('SF_ASSET_BASE_URL', {
  providedIn: 'root',
  factory: () => 'assets/forge',
});

/** URL of the kit icon sprite. Override to serve it from a CDN. */
export const SF_ICON_SPRITE_URL = new InjectionToken<string>('SF_ICON_SPRITE_URL', {
  providedIn: 'root',
  factory: () => `${inject(SF_ASSET_BASE_URL)}/icons/_sprite.svg`,
});

/**
 * `<sf-icon>` — renders one Soteria Forge kit icon from the shared SVG sprite.
 *
 * Icons are 24 × 24, 1.8 stroke, `currentColor`, round caps/joins (kit rule 4).
 * Accessibility:
 *  - Without `label` the icon is decorative: `aria-hidden="true"`, no role.
 *    Use this whenever adjacent text (or the parent control's `aria-label`)
 *    already names the thing.
 *  - With `label` it is exposed as `role="img"` with that `aria-label`.
 *
 * @example
 * <sf-icon name="home" />
 * <sf-icon name="lock" size="sm" label="Locked" />
 */
@Component({
  selector: 'sf-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-icon-host' },
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
        line-height: 0;
      }
      .sf-icon--lg {
        width: 44px;
        height: 44px;
      }
      .sf-icon--xs {
        width: 14px;
        height: 14px;
      }
    `,
  ],
  template: `
    <svg
      class="sf-icon"
      [class.sf-icon--sm]="size() === 'sm'"
      [class.sf-icon--xs]="size() === 'xs'"
      [class.sf-icon--lg]="size() === 'lg'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
    >
      <use [attr.href]="href()"></use>
    </svg>
  `,
})
export class SfIconComponent {
  private readonly spriteUrl = inject(SF_ICON_SPRITE_URL);

  /** Kit icon name (sprite id without the `sf-` prefix). */
  readonly name = input.required<SfIconName>();
  /** Accessible name. Omit for decorative icons. */
  readonly label = input<string>('');
  /** xs = 14 px, sm = 18 px, md = 24 px (kit default), lg = 44 px (badge medals). */
  readonly size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
  /** Kit stroke is 1.8; badge medals in the reference use a heavier 2.2. */
  readonly strokeWidth = input<number>(1.8);

  protected readonly href = computed(() => `${this.spriteUrl}#sf-${this.name()}`);
}
