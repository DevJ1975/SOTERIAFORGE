import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SfIconComponent, SfStreakStripComponent } from '@assurance/ui';
import type { PulseToday } from './home.models';

/** Home › Pulse · today: streak count, today's micro-lesson, 14-day strip. */
@Component({
  selector: 'assurance-home-pulse-card',
  standalone: true,
  imports: [SfIconComponent, SfStreakStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-card hp' },
  template: `
    <h2 class="sf-h3">Pulse · today</h2>
    <p class="hp__count">
      <sf-icon class="hp__flame" name="flame" size="lg" [strokeWidth]="2" />
      <span class="hp__num">{{ streakDays() }}</span>
      <span class="sf-sub">{{ streakDays() === 1 ? 'day' : 'days' }}</span>
      <span class="sf-visually-hidden"> streak</span>
    </p>
    <p class="sf-sub hp__msg">{{ data().message }}</p>
    <sf-streak-strip [days]="days()" />
    <p class="hp__caption">{{ activeCount() }} of the last {{ days().length }} days</p>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .hp__count {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin: 14px 0 0;
      }
      .hp__flame {
        align-self: center;
        color: var(--sf-ember);
      }
      .hp__num {
        font-size: 44px;
        font-weight: var(--sf-weight-black);
        line-height: 1;
      }
      .hp__msg {
        margin: 6px 0 var(--sf-space-4);
      }
      .hp__caption {
        margin: var(--sf-space-2) 0 0;
        font-size: var(--sf-text-xs);
        color: var(--sf-muted);
      }
    `,
  ],
})
export class HomePulseCardComponent {
  readonly streakDays = input<number>(0);
  /** 14 booleans, oldest first (see `streakStrip` in @assurance/gamification). */
  readonly days = input<readonly boolean[]>([]);
  readonly data = input.required<PulseToday>();

  protected readonly activeCount = computed(() => this.days().filter(Boolean).length);
}
