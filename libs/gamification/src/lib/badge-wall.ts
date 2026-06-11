import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { mergeBadgeWall, type BadgeAward } from './badges';

/**
 * Grid of every platform badge: earned ones in full color (ember shield, name,
 * earned date, Verify affordance), locked ones grayscale with their criteria.
 * Tiles stagger in on first render.
 */
@Component({
  selector: 'forge-badge-wall',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="wall" role="list">
      @for (tile of tiles(); track tile.id; let i = $index) {
        <li
          class="tile"
          [class.earned]="tile.earned"
          [class.locked]="!tile.earned"
          [style.animation-delay.ms]="i * 70"
        >
          <span class="shield" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24">
              <defs>
                <linearGradient [id]="'forge-badge-grad-' + tile.id" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="var(--sf-spark, #ffb552)" />
                  <stop offset="100%" stop-color="var(--sf-ember, #e8551f)" />
                </linearGradient>
              </defs>
              <path
                class="shield-face"
                [attr.fill]="
                  tile.earned ? 'url(#forge-badge-grad-' + tile.id + ')' : 'currentColor'
                "
                d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z"
              />
              @if (tile.earned) {
                <path
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.95)"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M8.2 12.2l2.6 2.6 5-5.4"
                />
              } @else {
                <path
                  fill="rgba(255, 255, 255, 0.85)"
                  d="M12 8a2.4 2.4 0 0 0-2.4 2.4v1.1H9v4h6v-4h-.6v-1.1A2.4 2.4 0 0 0 12 8zm0 1.4c.6 0 1 .5 1 1v1.1h-2v-1.1c0-.5.4-1 1-1z"
                />
              }
            </svg>
          </span>
          <span class="name">{{ tile.name }}</span>
          @if (tile.earned) {
            <span class="meta earned-date">Earned {{ tile.earnedAt | date: 'mediumDate' }}</span>
            <button type="button" class="verify" (click)="verify.emit(tile.id)">Verify</button>
          } @else {
            <span class="meta criteria">{{ tile.description }}</span>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .wall {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 14px;
    }

    .tile {
      display: grid;
      justify-items: center;
      gap: 6px;
      padding: 16px 12px;
      text-align: center;
      border: 1px solid var(--forge-border, #dddcde);
      border-radius: var(--forge-radius, 8px);
      background: var(--forge-surface, #fff);
      animation: forge-badge-in 360ms cubic-bezier(0.33, 1, 0.68, 1) backwards;
    }

    .tile.locked {
      filter: grayscale(1);
      opacity: 0.35;
    }

    .tile.locked .shield {
      color: var(--sf-steel, #3a4048);
    }

    .shield {
      line-height: 0;
    }

    .tile.earned .shield svg {
      filter: drop-shadow(0 2px 5px rgb(232 85 31 / 0.35));
    }

    .name {
      font-family: var(--forge-font-display, sans-serif);
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .meta {
      font-size: 12px;
      color: var(--forge-text-subtle, #8a929c);
    }

    .verify {
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--sf-ember, #e8551f);
      background: none;
      border: 1px solid currentColor;
      border-radius: 999px;
      padding: 2px 12px;
      cursor: pointer;
    }

    .verify:hover {
      color: var(--sf-ember-hover, #d8451a);
      background: rgb(232 85 31 / 0.08);
    }

    /* "from"-only keyframe: each tile animates to its natural opacity, so
       locked tiles settle at 0.35 without a flash to full opacity. */
    @keyframes forge-badge-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.92);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .tile {
        animation: none;
      }
    }
  `,
})
export class ForgeBadgeWall {
  /** The member's earned awards (from GamificationData.awards). */
  readonly awards = input<BadgeAward[]>([]);
  /**
   * Verify affordance stub: emits the badge id. Open Badges 3.0 credential
   * verification UI lands in Phase 4.1.
   */
  readonly verify = output<string>();

  protected readonly tiles = computed(() => mergeBadgeWall(this.awards()));
}
