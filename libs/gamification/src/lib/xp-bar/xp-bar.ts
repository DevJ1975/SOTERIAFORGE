import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { levelProgress } from '../xp/xp';

/**
 * Level chip + animated progress bar toward the next level, with the raw xp
 * numbers underneath. Pure presentation over the {@link levelProgress} engine.
 */
@Component({
  selector: 'forge-xp-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="xp-bar">
      <div class="xp-head">
        <span class="level-chip" [attr.aria-label]="'Level ' + progress().level">
          <span class="level-word">LVL</span>
          <span class="level-num">{{ progress().level }}</span>
        </span>
        <span class="xp-total">{{ formatXp(xp()) }} XP</span>
      </div>

      <div
        class="track"
        role="progressbar"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="100"
        [attr.aria-valuenow]="pctRounded()"
        [attr.aria-label]="ariaLabel()"
      >
        <div class="fill" [style.width.%]="pctRounded()"></div>
      </div>

      <div class="xp-foot">
        @if (progress().pct >= 1) {
          <span class="max">Max level reached</span>
        } @else {
          <span class="into"
            >{{ formatXp(progress().intoLevel) }} / {{ formatXp(progress().span) }}</span
          >
          <span class="next"
            >{{ formatXp(remaining()) }} XP to level {{ progress().level + 1 }}</span
          >
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      font-family: var(--forge-font, system-ui, sans-serif);
      color: var(--forge-text, #1a1d22);
    }

    .xp-bar {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .xp-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .level-chip {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--forge-accent, #e8551f);
      color: var(--forge-accent-fg, #fff);
      box-shadow: var(--forge-shadow-emphasized, 0 1px 4px rgb(0 0 0 / 0.15));
    }

    .level-word {
      font-family: var(--forge-font, system-ui, sans-serif);
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.14em;
      opacity: 0.85;
    }

    .level-num {
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      font-size: 18px;
      line-height: 1;
    }

    .xp-total {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.02em;
      color: var(--forge-text, #1a1d22);
    }

    .track {
      position: relative;
      height: 12px;
      border-radius: 999px;
      background: var(--forge-surface-dim, #f6f5f6);
      border: 1px solid var(--forge-border, #dddcde);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      border-radius: inherit;
      background: var(--forge-accent, #e8551f);
      background-image: linear-gradient(
        90deg,
        var(--forge-accent, #e8551f),
        var(--forge-accent-2, var(--forge-accent-hover, #ff7a3d))
      );
      transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .xp-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      color: var(--forge-text-subtle, #8a929c);
    }

    .into {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      color: var(--forge-text, #1a1d22);
    }

    .max {
      font-weight: 700;
      color: var(--forge-accent, #e8551f);
      letter-spacing: 0.02em;
    }
  `,
})
export class XpBar {
  /** Member's total accumulated XP. */
  readonly xp = input.required<number>();

  protected readonly progress = computed(() => levelProgress(this.xp()));

  protected readonly pctRounded = computed(() => Math.round(this.progress().pct * 100));

  protected readonly remaining = computed(() => {
    const p = this.progress();
    return Math.max(0, p.span - p.intoLevel);
  });

  protected readonly ariaLabel = computed(() => {
    const p = this.progress();
    return `Level ${p.level}, ${this.pctRounded()}% to level ${p.level + 1}`;
  });

  protected formatXp(value: number): string {
    return Math.round(value).toLocaleString('en-US');
  }
}
