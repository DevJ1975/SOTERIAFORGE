import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SfIconComponent, type SfIconName } from '@assurance/ui';

/**
 * Placeholder for rail destinations whose screens are scheduled in later
 * phases of docs/forge-platform-plan.md (Engage = 5, Progress = 3, ...).
 * Inputs are bound from route `data` via `withComponentInputBinding()`.
 */
@Component({
  selector: 'assurance-forge-placeholder',
  standalone: true,
  imports: [RouterLink, SfIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ph" [class.sf-pane]="dark()" [class.sf-card]="!dark()" aria-labelledby="ph-h">
      <span class="ph__icon" aria-hidden="true"><sf-icon [name]="icon()" /></span>
      <h1 id="ph-h" class="sf-h1">{{ title() }}</h1>
      <p class="ph__body">{{ description() }}</p>
      <span class="sf-tag" [class.sf-tag--ember]="!dark()">{{ phase() }}</span>
      <a routerLink="/" class="sf-btn" [class.sf-btn--secondary]="!dark()" [class.sf-btn--dark]="dark()"
        >Back to Home</a
      >
    </section>
  `,
  styles: [
    `
      .ph {
        max-width: 40rem;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--sf-space-4);
      }
      .ph__icon {
        display: inline-flex;
        padding: var(--sf-space-3);
        border-radius: var(--sf-radius-md);
        background: var(--sf-ember-soft);
        color: var(--sf-ember-on-soft);
      }
      .ph__body {
        margin: 0;
        color: var(--sf-ink-2);
      }
      .sf-pane .ph__body {
        color: var(--sf-dark-text);
      }
      .sf-pane .sf-btn--dark {
        border-color: var(--sf-dark-line);
      }
    `,
  ],
})
export class ForgePlaceholderPageComponent {
  readonly title = input<string>('Coming soon');
  readonly description = input<string>('');
  readonly phase = input<string>('');
  readonly icon = input<SfIconName>('clock');
  /** True for Engage, which renders on the dark shell variant. */
  readonly dark = input<boolean>(false);
}
