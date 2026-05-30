import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { LeaderboardRepository } from '@assurance/data-access';
import type { Leaderboard, LeaderboardEntry, LeaderboardPeriod } from '@assurance/shared';

/**
 * Renders the ranked leaderboard for the given tenant and time period.
 * Data is fetched once on init from {@link LeaderboardRepository}.
 */
@Component({
  selector: 'forge-leaderboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="leaderboard">
      <h2 class="leaderboard__title">Leaderboard</h2>

      @if (loading()) {
        <p class="leaderboard__status">Loading…</p>
      } @else if (entries().length === 0) {
        <p class="leaderboard__empty">No entries yet.</p>
      } @else {
        <ol class="leaderboard__list">
          @for (entry of entries(); track entry.uid) {
            <li class="leaderboard__entry" [class.leaderboard__entry--top3]="entry.rank <= 3">
              <span class="leaderboard__rank">{{ entry.rank }}</span>
              <span class="leaderboard__name">{{ entry.displayName ?? entry.uid }}</span>
              <span class="leaderboard__xp">{{ entry.xp }} XP</span>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .leaderboard {
        max-width: 36rem;
      }
      .leaderboard__title {
        font-size: 1.25rem;
        font-weight: 700;
        margin-bottom: 1rem;
      }
      .leaderboard__list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .leaderboard__entry {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 0.75rem;
        border-bottom: 1px solid var(--forge-border, #e5e7eb);
        font-size: 0.9375rem;
      }
      .leaderboard__entry--top3 {
        background: var(--forge-surface, #f9fafb);
        font-weight: 600;
      }
      .leaderboard__rank {
        min-width: 2rem;
        font-weight: 700;
        color: var(--forge-primary, #0b5fff);
        text-align: center;
      }
      .leaderboard__name {
        flex: 1;
      }
      .leaderboard__xp {
        color: var(--forge-text-muted, #6b7280);
        font-size: 0.875rem;
      }
      .leaderboard__status,
      .leaderboard__empty {
        color: var(--forge-text-muted, #6b7280);
        font-style: italic;
      }
    `,
  ],
})
export class LeaderboardComponent implements OnInit {
  /** Tenant whose leaderboard to display. */
  readonly tenantId = input.required<string>();
  /** Time window: 'daily' | 'weekly' | 'allTime'. Defaults to 'allTime'. */
  readonly period = input<LeaderboardPeriod>('allTime');

  private readonly leaderboardRepo = inject(LeaderboardRepository);

  protected readonly loading = signal(true);
  protected readonly entries = signal<LeaderboardEntry[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const doc: Leaderboard | null = await this.leaderboardRepo.get(
        this.tenantId(),
        this.period(),
      );
      this.entries.set(doc?.entries ?? []);
    } catch (err) {
      console.error('[LeaderboardComponent] Failed to load leaderboard', err);
    } finally {
      this.loading.set(false);
    }
  }
}
