import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Leaderboard, LeaderboardEntry } from '@forge/shared';

interface RankedRow {
  entry: LeaderboardEntry;
  rank: number;
  isCurrent: boolean;
  /** '🥇' | '🥈' | '🥉' for the top three, else ''. */
  medal: string;
  initials: string;
}

const MEDALS = ['🥇', '🥈', '🥉'] as const;

/**
 * Ranked leaderboard table. The top three rows get medal styling and the
 * current user's row is highlighted. Entries are sorted by their stored `rank`
 * (falling back to xp) so the table is robust to unsorted input.
 */
@Component({
  selector: 'forge-leaderboard-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length === 0) {
      <p class="empty">No leaderboard standings yet.</p>
    } @else {
      <table class="board" aria-label="Leaderboard">
        <thead>
          <tr>
            <th scope="col" class="col-rank">Rank</th>
            <th scope="col" class="col-name">Member</th>
            <th scope="col" class="col-xp">XP</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.entry.uid) {
            <tr
              class="row"
              [class.current]="row.isCurrent"
              [class.podium]="row.medal !== ''"
              [attr.aria-current]="row.isCurrent ? 'true' : null"
            >
              <td class="col-rank">
                @if (row.medal) {
                  <span class="medal" aria-hidden="true">{{ row.medal }}</span>
                }
                <span class="rank-num">{{ row.rank }}</span>
              </td>
              <td class="col-name">
                <span class="avatar" aria-hidden="true">
                  @if (row.entry.avatarUrl) {
                    <img [src]="row.entry.avatarUrl" [alt]="''" loading="lazy" />
                  } @else {
                    {{ row.initials }}
                  }
                </span>
                <span class="name">{{ row.entry.displayName || 'Anonymous' }}</span>
                @if (row.isCurrent) {
                  <span class="you">You</span>
                }
              </td>
              <td class="col-xp">{{ formatXp(row.entry.xp) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    :host {
      display: block;
      font-family: var(--forge-font, system-ui, sans-serif);
      color: var(--forge-text, #1a1d22);
    }

    .empty {
      margin: 0;
      padding: 24px;
      text-align: center;
      border: 1px dashed var(--forge-border, #dddcde);
      border-radius: var(--forge-radius, 8px);
      color: var(--forge-text-subtle, #8a929c);
      font-size: 13px;
    }

    .board {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    thead th {
      text-align: left;
      padding: 0 12px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--forge-text-subtle, #8a929c);
      border-bottom: 1px solid var(--forge-border, #dddcde);
    }

    .col-xp {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .col-rank {
      width: 84px;
      white-space: nowrap;
    }

    tbody .row td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--forge-border, #dddcde);
    }

    .rank-num {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .medal {
      margin-right: 4px;
      font-size: 16px;
    }

    .col-name {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      flex: 0 0 auto;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--forge-surface-dim, #f6f5f6);
      border: 1px solid var(--forge-border, #dddcde);
      font-size: 12px;
      font-weight: 700;
      color: var(--forge-text-subtle, #8a929c);
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .name {
      font-weight: 600;
    }

    .you {
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--forge-accent, #0b3d91);
      color: var(--forge-accent-fg, #fff);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .row.podium .rank-num {
      color: var(--forge-accent, #0b3d91);
    }

    .row.current td {
      background: color-mix(in srgb, var(--forge-accent, #0b3d91) 10%, transparent);
    }

    .row.current td:first-child {
      box-shadow: inset 3px 0 0 var(--forge-accent, #0b3d91);
    }
  `,
})
export class LeaderboardTable {
  /** Standings to render. Accepts the `entries` array of a {@link Leaderboard}. */
  readonly entries = input.required<Leaderboard['entries']>();

  /** The signed-in member's uid, highlighted when present in the standings. */
  readonly currentUid = input<string | undefined>(undefined);

  protected readonly rows = computed<RankedRow[]>(() => {
    const current = this.currentUid();
    const sorted = [...(this.entries() ?? [])].sort(
      (a, b) =>
        (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER) || b.xp - a.xp,
    );
    return sorted.map((entry, index) => {
      const rank = entry.rank || index + 1;
      return {
        entry,
        rank,
        isCurrent: !!current && entry.uid === current,
        medal: rank >= 1 && rank <= 3 ? MEDALS[rank - 1] : '',
        initials: this.initialsFor(entry.displayName),
      };
    });
  });

  protected formatXp(value: number): string {
    return Math.round(value).toLocaleString('en-US');
  }

  private initialsFor(name?: string): string {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
}
