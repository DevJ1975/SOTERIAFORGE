import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  GamificationApi,
  type ApiBadge,
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
const df = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * My Progress (forge_award.jpg, behind the overlay): level and XP bar, Pulse streak,
 * your private score, the crew leaderboard, and the badges you have earned with their
 * signed credentials. Crews only: individual learners are never ranked (SFG-SPC-FRG-011).
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

    <section class="sf-card pg__board" aria-labelledby="pg-earned">
      <h2 class="sf-h3" id="pg-earned">Earned badges and credentials</h2>
      <p class="sf-sub pg__note">
        Each one is a signed credential you can keep. Share its verification link with an employer,
        or download the file to add it to a badge wallet.
      </p>

      @if (badgesError()) {
        <p role="alert">{{ badgesError() }}</p>
      } @else if (earned(); as list) {
        @if (list.length === 0) {
          <p class="sf-sub">
            You have not earned a badge yet. Complete lessons to earn your first one.
          </p>
        } @else {
          <ul class="pg__list">
            @for (b of list; track b.id) {
              <li class="pg__badge">
                <span class="pg__crew">
                  {{ b.name }}
                  @if (b.kind === 'credential') {
                    <span class="sf-pill pg__you">Credential</span>
                  }
                </span>
                <span class="sf-sub">{{ earnedOn(b) }}</span>
                <span class="pg__actions">
                  <button
                    type="button"
                    class="sf-btn sf-btn--secondary sf-btn--sm"
                    [disabled]="busy() === b.id"
                    [attr.aria-label]="'Copy verification link for ' + b.name"
                    (click)="copyLink(b)"
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    class="sf-btn sf-btn--secondary sf-btn--sm"
                    [disabled]="busy() === b.id"
                    [attr.aria-label]="'Download credential for ' + b.name"
                    (click)="download(b)"
                  >
                    Download
                  </button>
                </span>
              </li>
            }
          </ul>
        }
        <p class="sf-sub pg__note" role="status">{{ notice() }}</p>
      } @else {
        <p class="sf-sub" role="status">Loading your badges…</p>
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
      .pg__badge {
        display: flex;
        align-items: center;
        gap: var(--sf-space-3) var(--sf-space-4);
        flex-wrap: wrap;
        padding: 10px 0;
        border-top: 1px solid var(--sf-line);
      }
      .pg__badge:first-child {
        border-top: 0;
      }
      .pg__actions {
        display: flex;
        gap: var(--sf-space-2);
        margin-left: auto;
      }
      .pg__actions .sf-btn {
        min-height: 44px;
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
  /** Earned badges only; null while loading. */
  protected readonly earned = signal<ApiBadge[] | null>(null);
  protected readonly badgesError = signal('');
  /** The badge whose credential is being fetched. */
  protected readonly busy = signal('');
  /** Outcome of the last copy or download, announced to screen readers. */
  protected readonly notice = signal('');

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
    void this.loadBadges();
  }

  protected earnedOn(badge: ApiBadge): string {
    return badge.earnedAt ? `Earned ${df.format(new Date(badge.earnedAt))}` : 'Earned';
  }

  protected async copyLink(badge: ApiBadge): Promise<void> {
    const signed = await this.signed(badge);
    if (!signed) return;
    try {
      await navigator.clipboard.writeText(signed.verifyUrl);
      this.notice.set(`Verification link for ${badge.name} copied.`);
    } catch {
      // Clipboard access can be refused; show the link so it can be copied by hand.
      this.notice.set(`Verification link for ${badge.name}: ${signed.verifyUrl}`);
    }
  }

  protected async download(badge: ApiBadge): Promise<void> {
    const signed = await this.signed(badge);
    if (!signed) return;
    const url = URL.createObjectURL(new Blob([signed.jwt], { type: 'application/jwt' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${badge.key}-credential.jwt`;
    link.click();
    URL.revokeObjectURL(url);
    this.notice.set(`Credential for ${badge.name} downloaded.`);
  }

  private async signed(badge: ApiBadge) {
    this.busy.set(badge.id);
    this.notice.set('');
    try {
      return await this.api.credential(badge.id);
    } catch (err) {
      this.notice.set(
        err instanceof HttpErrorResponse && err.status === 503
          ? 'Signed credentials are not set up yet. Your badge is still recorded.'
          : `The credential for ${badge.name} could not be loaded. Try again.`,
      );
      return null;
    } finally {
      this.busy.set('');
    }
  }

  private async loadBadges(): Promise<void> {
    try {
      const all = await this.api.badges();
      this.earned.set(all.filter((b) => b.awardId !== null && b.awardId !== undefined));
    } catch {
      this.badgesError.set('Your badges could not be loaded.');
    }
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
