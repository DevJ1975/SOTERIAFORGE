import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * `color`  → full-color faceted shield (crisp SVG).
 * `mono`   → single-color shield driven by `currentColor` (set via `color`).
 * `white` / `charcoal` → mono presets kept for backward compatibility.
 */
export type ForgeMarkVariant = 'color' | 'mono' | 'white' | 'charcoal';

/**
 * The official Soteria Forge mark (faceted ember shield + flame), served from
 * the shared brand assets (libs/ui/src/assets/brand → /brand at runtime).
 *
 * The full-color variant renders the crisp, resolution-independent SVG, with
 * the official PNG srcset kept as a graceful fallback if the SVG fails to load.
 * The single-color variants inline the mono SVG so it inherits `currentColor`:
 * set `color` (e.g. `color: var(--sf-charcoal)` or `#fff`) and the shield
 * recolors — accessible and crisp at any size.
 */
@Component({
  selector: 'forge-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isMono()) {
      <svg
        viewBox="0 0 120 120"
        [attr.width]="size()"
        [attr.height]="size()"
        role="img"
        aria-label="Soteria Forge"
      >
        <path
          fill-rule="evenodd"
          fill="currentColor"
          d="M60,12 L100,25 V58 C100,85 83,104 60,112 C37,104 20,85 20,58 V25 Z
             M60,40 C59,42 58,44 58,47 C58,54 55,55 54,51 C51,59 43,64 43,74 C43,88 51,98 60,98 C69,98 77,88 77,74 C77,59 64,55 60,40 Z"
        ></path>
      </svg>
    } @else {
      <img
        [src]="src()"
        [srcset]="srcset()"
        [width]="size()"
        [height]="size()"
        alt="Soteria Forge"
        decoding="async"
        (error)="onSvgError()"
      />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }

    /* charcoal/white presets resolve to brand tokens via currentColor */
    :host(.is-charcoal) {
      color: var(--sf-charcoal, #1b1e23);
    }

    :host(.is-white) {
      color: #fff;
    }

    img,
    svg {
      object-fit: contain;
    }
  `,
  host: {
    '[class.is-charcoal]': "variant() === 'charcoal'",
    '[class.is-white]': "variant() === 'white'",
  },
})
export class ForgeMark {
  readonly size = input(34);
  readonly variant = input<ForgeMarkVariant>('color');

  /** Single-color variants render the inline `currentColor` SVG. */
  protected readonly isMono = computed(() => this.variant() !== 'color');

  /** Flipped on SVG load failure so the PNG srcset takes over. */
  private readonly svgFailed = signal(false);

  /** Official color PNG ladder (also the SVG fallback). */
  private readonly pngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

  /** Crisp SVG by default; swaps to the smallest fitting PNG on error. */
  protected readonly src = computed(() =>
    this.svgFailed()
      ? `brand/mark-color/soteria-forge-mark-${this.oneX()}.png`
      : 'brand/soteria-forge-mark.svg',
  );

  /** Smallest official PNG ≥ the rendered size (1x). */
  private readonly oneX = computed(() => this.pngSizes.find((s) => s >= this.size()) ?? 1024);

  /** PNG srcset, kept as the graceful fallback once the SVG has failed. */
  protected readonly srcset = computed(() => {
    if (!this.svgFailed()) return '';
    const base = 'brand/mark-color/soteria-forge-mark';
    const twoX = this.pngSizes.find((s) => s >= this.size() * 2) ?? 1024;
    return `${base}-${this.oneX()}.png 1x, ${base}-${twoX}.png 2x`;
  });

  protected onSvgError(): void {
    this.svgFailed.set(true);
  }
}
