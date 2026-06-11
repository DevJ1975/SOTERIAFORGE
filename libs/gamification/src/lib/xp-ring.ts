import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { levelProgress } from './level';

/** Geometry shared by the template math below. */
const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

let nextGradientId = 0;

/**
 * Circular XP progress ring: current level in the center, progress toward
 * the next level as an ember-gradient arc with an animated sweep.
 */
@Component({
  selector: 'forge-xp-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 120 120"
      role="img"
      [attr.aria-label]="ariaLabel()"
    >
      <defs>
        <linearGradient [id]="gradientId" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stop-color="var(--sf-ember, #e8551f)" />
          <stop offset="100%" stop-color="var(--sf-spark, #ffb552)" />
        </linearGradient>
      </defs>
      <circle class="track" cx="60" cy="60" [attr.r]="radius" />
      <circle
        class="arc"
        cx="60"
        cy="60"
        [attr.r]="radius"
        [attr.stroke]="'url(#' + gradientId + ')'"
        [attr.stroke-dasharray]="circumference"
        [style.stroke-dashoffset]="dashOffset()"
      />
    </svg>
    <div class="center" aria-hidden="true">
      <span class="level-label">Level</span>
      <span class="level">{{ progress().level }}</span>
      <span class="xp">{{ progress().intoLevel }} / {{ progress().neededForNext }} XP</span>
    </div>
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
    }

    svg,
    .center {
      grid-area: 1 / 1;
    }

    svg {
      transform: rotate(-90deg);
    }

    circle {
      fill: none;
      stroke-width: 10;
      stroke-linecap: round;
    }

    .track {
      stroke: var(--forge-surface-dim, #f6f5f6);
    }

    .arc {
      transition: stroke-dashoffset 700ms cubic-bezier(0.33, 1, 0.68, 1);
    }

    .center {
      display: grid;
      justify-items: center;
      line-height: 1.15;
    }

    .level-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--forge-text-subtle, #8a929c);
    }

    .level {
      font-family: var(--forge-font-display, sans-serif);
      font-size: 34px;
      font-weight: 600;
      color: var(--forge-text, #1a1d22);
    }

    .xp {
      font-size: 11px;
      color: var(--forge-text-subtle, #8a929c);
    }
  `,
})
export class ForgeXpRing {
  /** Total XP, mapped through the platform level curve. */
  readonly xp = input(0);
  /** Rendered diameter in px. */
  readonly size = input(160);

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;
  /** Unique per instance so multiple rings on a page keep their gradients. */
  protected readonly gradientId = `forge-xp-ring-grad-${nextGradientId++}`;

  protected readonly progress = computed(() => levelProgress(this.xp()));

  /** Animated sweep: full circumference (empty) → 0 (full ring). */
  protected readonly dashOffset = computed(() => CIRCUMFERENCE * (1 - this.progress().pct / 100));

  protected readonly ariaLabel = computed(() => {
    const { level, intoLevel, neededForNext } = this.progress();
    return `Level ${level}, ${intoLevel} of ${neededForNext} XP toward the next level`;
  });
}
