import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ForgeMarkVariant = 'color' | 'white' | 'charcoal';

/**
 * The official Soteria Forge mark (faceted ember shield + flame), served from
 * the shared brand assets (libs/ui/src/assets/brand → /brand at runtime).
 */
@Component({
  selector: 'forge-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      [src]="src()"
      [srcset]="srcset()"
      [width]="size()"
      [height]="size()"
      alt="Soteria Forge"
      decoding="async"
    />
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }

    img {
      object-fit: contain;
    }
  `,
})
export class ForgeMark {
  readonly size = input(34);
  readonly variant = input<ForgeMarkVariant>('color');

  private readonly base = computed(() => {
    switch (this.variant()) {
      case 'white':
        return 'brand/mark-mono-white/soteria-forge-mark-white';
      case 'charcoal':
        return 'brand/mark-mono-charcoal/soteria-forge-mark-charcoal';
      default:
        return 'brand/mark-color/soteria-forge-mark';
    }
  });

  /** Smallest official PNG ≥ the rendered size (1x). */
  private readonly oneX = computed(() => {
    const sizes =
      this.variant() === 'color' ? [16, 32, 48, 64, 128, 256, 512, 1024] : [128, 256, 512, 1024];
    return sizes.find((s) => s >= this.size()) ?? 1024;
  });

  protected readonly src = computed(() => `${this.base()}-${this.oneX()}.png`);

  protected readonly srcset = computed(() => {
    const sizes =
      this.variant() === 'color' ? [16, 32, 48, 64, 128, 256, 512, 1024] : [128, 256, 512, 1024];
    const twoX = sizes.find((s) => s >= this.size() * 2) ?? 1024;
    return `${this.base()}-${this.oneX()}.png 1x, ${this.base()}-${twoX}.png 2x`;
  });
}
