import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * `<sf-progress-ring>` — the kit's ember progress ring (`.sf-ring__track` /
 * `.sf-ring__value`) with a centred percentage and optional caption.
 *
 * Exposed to assistive tech as a `progressbar` with `aria-valuenow` and a
 * spoken `aria-valuetext` ("56% complete, Week 5"); the drawn label is hidden
 * from AT so it is not read twice.
 */
@Component({
  selector: 'sf-progress-ring',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sf-ring',
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'pct()',
    '[attr.aria-valuetext]': 'valueText()',
    '[attr.aria-label]': 'label() || null',
  },
  template: `
    <svg viewBox="0 0 132 132" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
      <circle class="sf-ring__track" cx="66" cy="66" r="58" />
      <circle
        class="sf-ring__value"
        cx="66"
        cy="66"
        r="58"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="offset()"
      />
    </svg>
    <span class="sf-ring__label" aria-hidden="true">
      <span class="sf-ring__pct">{{ pct() }}%</span>
      @if (caption()) {
        <span class="sf-ring__caption">{{ caption() }}</span>
      }
    </span>
  `,
})
export class SfProgressRingComponent {
  /** Progress, 0–100 (clamped, rounded). */
  readonly value = input<number>(0);
  /** Small caption under the percentage, e.g. "Week 5". */
  readonly caption = input<string>('');
  /** Accessible name of the progress bar, e.g. the course title. */
  readonly label = input<string>('');
  /** Rendered diameter in px (the drawing scales from 132). */
  readonly size = input<number>(132);

  protected readonly circumference = CIRCUMFERENCE.toFixed(1);
  protected readonly pct = computed(() =>
    Math.round(Math.min(100, Math.max(0, Number(this.value()) || 0))),
  );
  protected readonly offset = computed(() => (CIRCUMFERENCE * (1 - this.pct() / 100)).toFixed(1));
  protected readonly valueText = computed(
    () => `${this.pct()}% complete${this.caption() ? ', ' + this.caption() : ''}`,
  );
}
