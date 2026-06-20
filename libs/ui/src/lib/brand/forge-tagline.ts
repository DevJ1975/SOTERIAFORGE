import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The Soteria Forge tagline lockup: SAFETY · COMPLIANCE · TRAINING, set in the
 * brand UI face (Barlow Semi Condensed 600, wide tracking, uppercase) on the
 * `--sf-muted` ink. Mirrors the global `.forge-tagline` utility but is
 * self-contained so it stays correct under view encapsulation. Override the
 * tokens (`--sf-muted`, `--forge-font`) to retheme.
 */
@Component({
  selector: 'forge-tagline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <span class="forge-tagline">SAFETY · COMPLIANCE · TRAINING</span> `,
  styles: `
    :host {
      display: inline-flex;
    }

    .forge-tagline {
      font-family: var(--forge-font, 'Barlow Semi Condensed', sans-serif);
      font-weight: 600;
      font-size: 0.72rem;
      letter-spacing: 0.32em;
      text-transform: uppercase;
      color: var(--sf-muted, #8a929c);
      white-space: nowrap;
    }
  `,
})
export class ForgeTagline {}
