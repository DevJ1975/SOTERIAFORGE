import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * `<sf-streak-strip>` — the kit's day strip (`.sf-streak` / `.sf-streak__day`),
 * oldest day first. Exposed as a single image whose accessible name states the
 * count in words ("Active 13 of the last 14 days"), so the ember/grey squares
 * are never the only carrier of meaning.
 */
@Component({
  selector: 'sf-streak-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sf-streak sf-streak--fluid',
    role: 'img',
    '[attr.aria-label]': 'summary()',
  },
  template: `
    @for (done of days(); track $index) {
      <span class="sf-streak__day" [class.is-done]="done"></span>
    }
  `,
})
export class SfStreakStripComponent {
  /** One entry per day, oldest first; `true` = active that day. */
  readonly days = input<readonly boolean[]>([]);

  readonly activeCount = computed(() => this.days().filter(Boolean).length);
  readonly summary = computed(
    () => `Active ${this.activeCount()} of the last ${this.days().length} days`,
  );
}
