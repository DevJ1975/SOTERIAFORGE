import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Visual tone of the streak flame for a given streak length. */
export type FlameTone = 'cold' | 'warm' | 'spark' | 'ember';

/**
 * Pure tone mapping: gray at 0 (cold) and for a young 1–2 day streak (warm),
 * spark-orange from 3 days, ember (with pulse) from 7.
 */
export function flameTone(days: number): FlameTone {
  if (!Number.isFinite(days) || days <= 0) return 'cold';
  if (days >= 7) return 'ember';
  if (days >= 3) return 'spark';
  return 'warm';
}

/**
 * Streak-day counter with a flame mark. The inline SVG echoes the flame
 * silhouette of the Soteria Forge brand mark (single licking flame with a
 * hollow core).
 */
@Component({
  selector: 'forge-streak-flame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flame" [class]="tone()" aria-hidden="true">
      <svg width="32" height="32" viewBox="0 0 24 24">
        <!-- Outer flame: tilted tip + full belly, after the brand mark. -->
        <path
          fill="currentColor"
          d="M12.6 2c.5 3.1-1.4 4.8-2.9 6.6C8.2 10.4 7 12.2 7 14.5 7 18.6 9.3 22 12.5 22c3.1 0 5.5-3.2 5.5-7.2 0-2.2-1-4-2.2-5.7-.4 1-1 1.9-1.9 2.5.4-3.3-.4-6.7-1.3-9.6z"
        />
        <!-- Hollow core. -->
        <path
          class="core"
          d="M12.4 13.4c.9 1 1.4 2 1.4 3.2 0 1.7-.8 3-1.9 3-1 0-1.8-1.2-1.8-2.8 0-1.5 1-2.5 2.3-3.4z"
        />
      </svg>
    </span>
    <span class="count">
      <span class="days">{{ days() }}</span>
      <span class="label">day streak</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .flame {
      display: inline-flex;
      line-height: 0;
    }

    .flame.cold {
      color: var(--sf-hairline, #dddcde);
    }

    .flame.warm {
      color: var(--sf-muted, #8a929c);
    }

    .flame.spark {
      color: var(--sf-spark, #ffb552);
    }

    .flame.ember {
      color: var(--sf-ember, #e8551f);
      animation: forge-flame-pulse 1.6s ease-in-out infinite;
    }

    .core {
      fill: var(--forge-surface, #fff);
    }

    .count {
      display: grid;
      line-height: 1.1;
    }

    .days {
      font-family: var(--forge-font-display, sans-serif);
      font-size: 24px;
      font-weight: 600;
      color: var(--forge-text, #1a1d22);
    }

    .label {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--forge-text-subtle, #8a929c);
    }

    @keyframes forge-flame-pulse {
      0%,
      100% {
        transform: scale(1);
        filter: none;
      }
      50% {
        transform: scale(1.08);
        filter: drop-shadow(0 0 6px rgb(232 85 31 / 0.55));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .flame.ember {
        animation: none;
      }
    }
  `,
  host: { '[attr.aria-label]': 'ariaLabel()' },
})
export class ForgeStreakFlame {
  /** Consecutive learning days (member.streakDays). */
  readonly days = input(0);

  protected readonly tone = computed(() => flameTone(this.days()));
  protected readonly ariaLabel = computed(() => `${this.days()}-day learning streak`);
}
