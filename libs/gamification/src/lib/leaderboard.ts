import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import type { LeaderboardEntry, LeaderboardPeriod } from '@forge/shared';
import { initialOf, medalFor } from './rank';

interface PeriodTab {
  period: LeaderboardPeriod;
  label: string;
}

const PERIOD_TABS: readonly PeriodTab[] = [
  { period: 'daily', label: 'Daily' },
  { period: 'weekly', label: 'Weekly' },
  { period: 'allTime', label: 'All time' },
];

/**
 * Presentational leaderboard: period tabs, ranked rows with top-3 medal
 * tints, avatar-initial discs, and the signed-in user's row highlighted in
 * ember and scrolled into view. The host page owns the data subscription and
 * feeds `entries` (undefined = loading) per selected period.
 */
@Component({
  selector: 'forge-leaderboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist" aria-label="Leaderboard period">
      @for (tab of tabs; track tab.period) {
        <button
          type="button"
          role="tab"
          class="tab"
          [class.active]="tab.period === period()"
          [attr.aria-selected]="tab.period === period()"
          (click)="periodChange.emit(tab.period)"
        >
          {{ tab.label }}
        </button>
      }
    </div>

    @if (entries(); as rows) {
      @if (rows.length === 0) {
        <p class="empty">No rankings yet — complete a lesson to get on the board.</p>
      } @else {
        <ol class="board" role="list">
          @for (entry of rows; track entry.uid) {
            <li
              class="row"
              [class.me]="entry.uid === currentUid()"
              [class.gold]="medalOf(entry.rank) === 'gold'"
              [class.silver]="medalOf(entry.rank) === 'silver'"
              [class.bronze]="medalOf(entry.rank) === 'bronze'"
            >
              <span class="rank" [class.medal]="medalOf(entry.rank) !== null">
                {{ entry.rank }}
              </span>
              <span class="avatar" aria-hidden="true">
                @if (entry.avatarUrl) {
                  <img [src]="entry.avatarUrl" alt="" loading="lazy" />
                } @else {
                  {{ initial(entry) }}
                }
              </span>
              <span class="name">
                {{ entry.displayName || 'Learner ' + entry.uid.slice(0, 6) }}
                @if (entry.uid === currentUid()) {
                  <span class="you">You</span>
                }
              </span>
              <span class="xp">{{ entry.xp }} XP</span>
            </li>
          }
        </ol>
      }
    } @else {
      <div class="board" aria-hidden="true">
        @for (skeleton of [0, 1, 2, 3, 4]; track skeleton) {
          <div class="row skeleton-row">
            <span class="skeleton rank-skeleton"></span>
            <span class="skeleton avatar-skeleton"></span>
            <span class="skeleton name-skeleton"></span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .tabs {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      margin-bottom: 16px;
      background: var(--forge-surface-dim, #f6f5f6);
      border: 1px solid var(--forge-border, #dddcde);
      border-radius: 999px;
    }

    .tab {
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.03em;
      color: var(--forge-text-subtle, #8a929c);
      background: none;
      border: 0;
      border-radius: 999px;
      padding: 6px 16px;
      cursor: pointer;
    }

    .tab.active {
      color: #fff;
      background: var(--sf-grad-ember, #e8551f);
    }

    .board {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 6px;
      max-height: 480px;
      overflow-y: auto;
    }

    .row {
      display: grid;
      grid-template-columns: 36px 36px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border: 1px solid var(--forge-border, #dddcde);
      border-radius: var(--forge-radius, 8px);
      background: var(--forge-surface, #fff);
    }

    .row.gold {
      background: linear-gradient(100deg, rgb(255 200 64 / 0.22), var(--forge-surface, #fff) 70%);
      border-color: rgb(212 160 23 / 0.55);
    }

    .row.silver {
      background: linear-gradient(100deg, rgb(155 165 178 / 0.22), var(--forge-surface, #fff) 70%);
      border-color: rgb(145 155 168 / 0.55);
    }

    .row.bronze {
      background: linear-gradient(100deg, rgb(196 120 60 / 0.2), var(--forge-surface, #fff) 70%);
      border-color: rgb(176 108 56 / 0.55);
    }

    .row.me {
      border: 2px solid var(--sf-ember, #e8551f);
      background: rgb(232 85 31 / 0.07);
      box-shadow: 0 0 0 3px rgb(232 85 31 / 0.12);
    }

    .rank {
      font-family: var(--forge-font-display, sans-serif);
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      color: var(--forge-text-subtle, #8a929c);
    }

    .rank.medal {
      color: var(--forge-text, #1a1d22);
    }

    .gold .rank.medal {
      color: #b8860b;
    }

    .silver .rank.medal {
      color: #6e7a87;
    }

    .bronze .rank.medal {
      color: #a05a2c;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      overflow: hidden;
      font-weight: 700;
      color: #fff;
      background: var(--sf-steel, #3a4048);
    }

    .me .avatar {
      background: var(--sf-grad-ember, #e8551f);
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .you {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #fff;
      background: var(--sf-ember, #e8551f);
      border-radius: 999px;
      padding: 1px 8px;
    }

    .xp {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      color: var(--forge-text, #1a1d22);
    }

    .empty {
      margin: 0;
      padding: 24px 0;
      color: var(--forge-text-subtle, #8a929c);
    }

    .skeleton {
      display: block;
      border-radius: var(--forge-radius-small, 4px);
      background: linear-gradient(
        100deg,
        var(--forge-surface-dim, #f6f5f6) 40%,
        var(--forge-border, #dddcde) 50%,
        var(--forge-surface-dim, #f6f5f6) 60%
      );
      background-size: 200% 100%;
      animation: forge-board-shimmer 1.2s linear infinite;
    }

    .rank-skeleton {
      height: 16px;
    }

    .avatar-skeleton {
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }

    .name-skeleton {
      height: 14px;
      width: 60%;
    }

    @keyframes forge-board-shimmer {
      to {
        background-position: -200% 0;
      }
    }
  `,
})
export class ForgeLeaderboard {
  /** Ranked entries for the selected period; undefined while loading. */
  readonly entries = input<LeaderboardEntry[] | undefined>(undefined);
  /** The signed-in user's uid: their row is highlighted and kept visible. */
  readonly currentUid = input<string | null>(null);
  /** Controlled period selection (page owns the state + data subscription). */
  readonly period = input<LeaderboardPeriod>('weekly');
  readonly periodChange = output<LeaderboardPeriod>();

  protected readonly tabs = PERIOD_TABS;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Tracks (entries, uid) so the caller's row also reads as a signal dep. */
  private readonly myRowKey = computed(
    () => `${this.currentUid() ?? ''}#${this.entries()?.length ?? -1}#${this.period()}`,
  );

  constructor() {
    // Pin the signed-in user's row into the visible scroll area whenever the
    // rendered list changes. Optional-call: jsdom has no scrollIntoView.
    afterRenderEffect(() => {
      this.myRowKey();
      const row = this.host.nativeElement.querySelector('.row.me');
      row?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  protected medalOf = medalFor;
  protected initial(entry: LeaderboardEntry): string {
    return initialOf(entry.displayName ?? entry.uid);
  }
}
