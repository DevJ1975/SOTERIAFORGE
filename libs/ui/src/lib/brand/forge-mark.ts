import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The Soteria Forge primary mark ("Forge Shield" — shield carrying a forge
 * flame), inlined as SVG so it inherits no external asset dependencies.
 */
@Component({
  selector: 'forge-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Soteria Forge"
    >
      <defs>
        <linearGradient id="sfGradEmber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#F59A3D" />
          <stop offset="1" stop-color="#DE4A1B" />
        </linearGradient>
      </defs>
      <path
        d="M60,14 L98,26 V58 C98,84 82,102 60,110 C38,102 22,84 22,58 V26 Z"
        fill="url(#sfGradEmber)"
      />
      <path
        d="M60,14 L98,26 V58 C98,72 92,83 83,91 C84,70 78,40 60,22 C42,40 36,70 37,91 C28,83 22,72 22,58 V26 Z"
        fill="#ffffff"
        opacity="0.10"
      />
      <path
        d="M60,37 C62,51 73,57 73,71 C73,84 67,93 60,93 C53,93 47,84 47,71 C47,62 53,58 55,50 C56,53 58,52 58,46 C59,43 60,40 60,37 Z"
        fill="#F7F2EA"
      />
      <path
        d="M60,66 C61,72 66,75 66,80 C66,85 63,88 60,88 C57,88 54,85 54,80 C54,75 59,72 60,66 Z"
        fill="#E8551F"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }
  `,
})
export class ForgeMark {
  readonly size = input(34);
}
