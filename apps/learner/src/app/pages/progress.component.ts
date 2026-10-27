import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  GamificationApi,
  type ApiCrewBoard,
  type ApiScoreCard,
  type CrewBoardPeriod,
} from '@assurance/lms-core';
import { SfIconComponent, SfStreakStripComponent } from '@assurance/ui';

const PERIODS: readonly { id: CrewBoardPeriod; label: string }[] = [
  { id: 'daily', label: 'Today' },
  { id: 'weekly', label: 'This week' },
  { id: 'allTime', label: 'All time' },
];

const nf = new Intl.NumberFormat('en-US');

/**
 * My Progress (forge_award.jpg, behind the overlay): level and XP bar, Pulse streak,
 * your private score, and the crew leaderboard. Crews only: individual learners are
 * never ranked (SFG-SPC-FRG-011).
 */
@Component({
  selector: 'assurance-progress-page',
  standalone: true,
  imports: [SfIconComponent, SfStreakStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="sf-h1">My progress</h1>

    @if (error()) {
      <p class="sf-card pg__error" role="alert">{{ error() }}</p>
    } @else if (card(); as c) {
      <div class="pg__row">
        <section class="sf-card" aria-labelledby="pg-level">
          <div class="pg__head">
            <h2 class="sf-h3" id="pg-level">Level {{ c.level }}</h2>
            <span class="sf-sub">{{ xpLine() }}</span>
          </div>
          <div
            class="sf-xp"
            role="progressbar"
            aria-label="XP toward the next level"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="levelPct()"
          >
            <div class="sf-xp__fill" [style.width.%]="levelPct()"></div>
          </div>
          <p class="sf-sub pg__note">
            {{ fmt(c.totalXp) }} XP in total · {{ fmt(c.todayXp) }} XP today
          </p>
        </section>

        <section class="sf-card" aria-labelledby="pg-streak">
          <h2 class="sf-h3" id="pg-streak">Pulse streak</h2>
          <p class="pg__count">
            <sf-icon class="pg__flame" name="flame" size="lg" [strokeWidth]="2" />
            <span class="pg__num">{{ c.streakDays }}</span>
            <span class="sf-sub">{{ c.streakDays === 1 ? 'day' : 'days' }}</span>
          </p>
          <sf-streak-strip [days]="c.strip" />
        </section>
      </div>
    } @else {
      <p class="sf-sub" role="status">Loading your progress…</p>
    }

    <section class="sf-card pg__board" aria-labelledby="pg-board">
      <div class="pg__head">
        <h2 class="sf-h3" id="pg-board">Crew leaderboard</h2>
        <div class="pg__tabs" role="group" aria-label="Leaderboard period">
          @for (p of periods; track p.id) {
            <button
              type="button"
              class="sf-chip"
              [attr.aria-pressed]="period() === p.id"
              [class.is-on]="period() === p.id"
              (click)="choose(p.id)"
            >
              {{ p.label }}
            </button>
          }
        </div>
      </div>
      <p class="sf-sub pg__note">
        Crews only. Your individual score is private to you and your instructor.
      </p>

      @if (boardError()) {
        <p role="alert">{{ boardError() }}</p>
      } @else if (board(); as b) {
        @if (b.crews.length === 0) {
          <p class="sf-sub">
            You are not on a crew yet. Your instructor assigns crews, and standings appear here once
            you are on one.
          </p>
        } @else {
          <ol class="pg__list">
            @for (row of b.crews; track row.crewId) {
              <li class="sf-lb-row" [class.is-mine]="row.mine">
                <span class="sf-lb-row__rank" [attr.aria-label]="'Rank ' + row.rank">{{
                  row.rank
                }}</span>
                <span class="pg__crew">
                  {{ row.name }}
                  @if (row.mine) {
                    <span class="sf-pill pg__you">Your crew</span>
                  }
                </span>
                <span class="sf-sub">{{ row.memberCount }} members</span>
                <span class="sf-lb-row__pts">{{ fmt(row.score) }} XP</span>
              </li>
            }
          </ol>
          <p class="sf-sub pg__note">{{ b.scoring }}</p>
        }
      } @else {
        <p class="sf-sub" role="status">Loading standings…</p>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 64rem;
      }
      .pg__row {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
        gap: var(--sf-space-6);
        margin: var(--sf-space-6) 0;
      }
      .pg__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--sf-space-4);
        flex-wrap: wrap;
        margin-bottom: var(--sf-space-3);
      }
      .pg__note {
        margin: var(--sf-space-3) 0 0;
      }
      .pg__count {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin: 14px 0;
      }
      .pg__flame {
        align-self: center;
        color: var(--sf-ember);
      }
      .pg__num {
        font-size: 44px;
        font-weight: var(--sf-weight-black);
        line-height: 1;
      }
      .pg__board {
        margin-top: var(--sf-space-6);
      }
      .pg__tabs {
        display: flex;
        gap: 6px;
      }
      .sf-chip {
        min-height: 44px;
      }
      .sf-chip.is-on {
        background: var(--sf-ember-soft);
        border-color: var(--sf-ember);
        color: var(--sf-ember-on-soft);
      }
      .pg__list {
        display: grid;
        gap: 10px;
        margin: var(--sf-space-4) 0 0;
        padding: 0;
        list-style: none;
      }
      .pg__crew {
        font-weight: var(--sf-weight-bold);
      }
      .pg__you {
        height: 24px;
        margin-left: 8px;
        font-size: var(--sf-text-xs);
      }
      .pg__error {
        color: var(--sf-danger);
        margin-top: var(--sf-space-4);
      }
      @media (max-width: 64rem) {
        .pg__row {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class ProgressComponent implements OnInit {
  private readonly api = inject(GamificationApi);

  protected readonly periods = PERIODS;
  protected readonly card = signal<ApiScoreCard | null>(null);
  protected readonly error = signal('');
  protected readonly period = signal<CrewBoardPeriod>('weekly');
  protected readonly board = signal<ApiCrewBoard | null>(null);
  protected readonly boardError = signal('');

  protected readonly levelPct = computed(() => {
    const c = this.card();
    return c && c.xpToNext > 0 ? Math.min(100, Math.round((c.xpIntoLevel / c.xpToNext) * 100)) : 0;
  });
  protected readonly xpLine = computed(() => {
    const c = this.card();
    return c
      ? `${nf.format(c.xpIntoLevel)} / ${nf.format(c.xpToNext)} XP to level ${c.level + 1}`
      : '';
  });

  protected fmt(n: number): string {
    return nf.format(n);
  }

  ngOnInit(): void {
    void this.loadCard();
    void this.loadBoard();
  }

  protected choose(period: CrewBoardPeriod): void {
    if (period === this.period()) return;
    this.period.set(period);
    void this.loadBoard();
  }

  private async loadCard(): Promise<void> {
    try {
      this.card.set(await this.api.progress());
    } catch {
      this.error.set('Your progress could not be loaded. Check your connection and try again.');
    }
  }

  private async loadBoard(): Promise<void> {
    const wanted = this.period();
    this.board.set(null);
    this.boardError.set('');
    try {
      const board = await this.api.crewBoard(wanted);
      if (wanted === this.period()) this.board.set(board); // ignore a stale tab's reply
    } catch {
      if (wanted === this.period()) this.boardError.set('The leaderboard could not be loaded.');
    }
  }
}
