import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ForgeMark } from './forge-mark';

/** Ground the lockup sits on — drives the SOTERIA/FORGE wordmark colors. */
export type ForgeLockupTone = 'light' | 'dark';

/**
 * Horizontal Soteria Forge lockup: the full-color faceted shield beside the
 * split SOTERIA / FORGE wordmark (reusing the shell's split treatment). On a
 * light ground the wordmark is ink + ember; on a dark ground it is cream +
 * ember-hot. All colors are brand tokens, so tenants override at runtime.
 */
@Component({
  selector: 'forge-lockup',
  imports: [ForgeMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <forge-mark [size]="size()" />
    <span class="lockup-word">SOTERIA<span class="ember">FORGE</span></span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.42em;
    }

    .lockup-word {
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      font-size: 1.18em;
      line-height: 1;
      letter-spacing: 0.01em;
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--sf-ink, #1a1d22);
    }

    .lockup-word .ember {
      margin-left: 0.32em;
      color: var(--sf-ember, #e8551f);
    }

    :host(.is-dark) .lockup-word {
      color: var(--sf-cast, #f6f1e9);
    }

    :host(.is-dark) .lockup-word .ember {
      color: var(--sf-ember-hot, #ff7a3d);
    }
  `,
  host: {
    '[class.is-dark]': "tone() === 'dark'",
  },
})
export class ForgeLockup {
  readonly size = input(34);
  readonly tone = input<ForgeLockupTone>('light');
}
