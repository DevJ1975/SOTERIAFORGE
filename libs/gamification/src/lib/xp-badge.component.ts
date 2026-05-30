import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { levelForXp } from './leveling';

/**
 * Displays a learner's level, XP progress within the current level, and streak.
 * Pure presentational component — all data is passed via signal inputs.
 */
@Component({
  selector: 'assurance-xp-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="xp-badge">
      <div class="xp-badge__level">
        <span class="xp-badge__level-label">Level</span>
        <span class="xp-badge__level-value">{{ levelInfo().level }}</span>
      </div>

      <div class="xp-badge__progress-wrap" [title]="xpProgressLabel()">
        <div class="xp-badge__progress-bar">
          <div class="xp-badge__progress-fill" [style.width.%]="xpProgressPct()"></div>
        </div>
        <span class="xp-badge__progress-label">{{ xpProgressLabel() }}</span>
      </div>

      @if (streakDays() > 0) {
        <div class="xp-badge__streak">
          <span class="xp-badge__streak-icon">🔥</span>
          <span class="xp-badge__streak-value">{{ streakDays() }}</span>
          <span class="xp-badge__streak-label">day streak</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .xp-badge {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.875rem;
        background: var(--assurance-surface, #f9fafb);
        border: 1px solid var(--assurance-border, #e5e7eb);
        border-radius: 2rem;
        font-size: 0.875rem;
      }
      .xp-badge__level {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 2.5rem;
      }
      .xp-badge__level-label {
        font-size: 0.625rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--assurance-text-muted, #6b7280);
      }
      .xp-badge__level-value {
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--assurance-primary, #0b5fff);
        line-height: 1;
      }
      .xp-badge__progress-wrap {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 6rem;
      }
      .xp-badge__progress-bar {
        height: 0.375rem;
        background: var(--assurance-border, #e5e7eb);
        border-radius: 0.25rem;
        overflow: hidden;
      }
      .xp-badge__progress-fill {
        height: 100%;
        background: var(--assurance-primary, #0b5fff);
        border-radius: 0.25rem;
        transition: width 0.3s ease;
      }
      .xp-badge__progress-label {
        font-size: 0.625rem;
        color: var(--assurance-text-muted, #6b7280);
        white-space: nowrap;
      }
      .xp-badge__streak {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #f97316;
      }
      .xp-badge__streak-icon {
        line-height: 1;
      }
      .xp-badge__streak-label {
        font-weight: 400;
        color: var(--assurance-text-muted, #6b7280);
        font-size: 0.75rem;
      }
    `,
  ],
})
export class XpBadgeComponent {
  /** Total accumulated XP (non-negative). */
  readonly xp = input<number>(0);
  /** Current streak in days (non-negative). */
  readonly streakDays = input<number>(0);

  protected readonly levelInfo = computed(() => levelForXp(Math.max(0, this.xp())));

  /** Percentage progress within the current level (0–100). */
  protected readonly xpProgressPct = computed(() => {
    const { xpIntoLevel, xpToNext } = this.levelInfo();
    if (xpToNext <= 0) return 100;
    return Math.min(100, Math.round((xpIntoLevel / xpToNext) * 100));
  });

  protected readonly xpProgressLabel = computed(() => {
    const { xpIntoLevel, xpToNext } = this.levelInfo();
    return `${xpIntoLevel} / ${xpToNext} XP`;
  });
}
