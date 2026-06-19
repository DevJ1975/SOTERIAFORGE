import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Compact flame + day-count chip for a member's activity streak. Goes inert
 * (cool grey, no glow) when the streak is zero so it reads honestly.
 */
@Component({
  selector: 'forge-streak-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="chip"
      [class.cold]="days() <= 0"
      [attr.aria-label]="ariaLabel()"
      [title]="ariaLabel()"
    >
      <span class="flame" aria-hidden="true">{{ days() > 0 ? '🔥' : '🟦' }}</span>
      <span class="count">{{ days() }}</span>
      <span class="unit" aria-hidden="true">{{ days() === 1 ? 'day' : 'days' }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      font-family: var(--forge-font, system-ui, sans-serif);
    }

    .chip {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--forge-accent, #0b3d91) 12%, var(--forge-surface, #fff));
      border: 1px solid color-mix(in srgb, var(--forge-accent, #0b3d91) 35%, transparent);
      color: var(--forge-text, #1a1d22);
      box-shadow: var(--forge-shadow-emphasized, 0 1px 4px rgb(0 0 0 / 0.15));
    }

    .chip.cold {
      background: var(--forge-surface-dim, #f6f5f6);
      border-color: var(--forge-border, #dddcde);
      box-shadow: none;
      color: var(--forge-text-subtle, #8a929c);
    }

    .flame {
      font-size: 14px;
      line-height: 1;
    }

    .count {
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      font-size: 16px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .unit {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--forge-text-subtle, #8a929c);
    }
  `,
})
export class StreakChip {
  /** Consecutive active days. Negative / non-finite input is treated as 0. */
  readonly streakDays = input.required<number>();

  protected readonly days = computed(() => {
    const v = this.streakDays();
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  });

  protected readonly ariaLabel = computed(() => {
    const d = this.days();
    if (d <= 0) return 'No active streak';
    return `${d}-day streak`;
  });
}
