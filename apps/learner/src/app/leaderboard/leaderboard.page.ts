import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { PrincipalStore } from '@forge/auth';
import { ForgeLeaderboard, GamificationData, type LiveSnapshot } from '@forge/gamification';
import type { Leaderboard, LeaderboardEntry, LeaderboardPeriod } from '@forge/shared';

type LeaderboardState = 'loading' | 'ready' | 'no-tenant';

/**
 * Tenant leaderboard: live snapshot of /tenants/{t}/leaderboard/{period},
 * rendered by the presentational ForgeLeaderboard. The page owns the period
 * tab state and re-subscribes per period.
 */
@Component({
  selector: 'app-leaderboard-page',
  imports: [ForgeLeaderboard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="head">
        <h1>Leaderboard</h1>
        <p>See how your forge stacks up across the team. Rankings refresh hourly.</p>
      </section>

      @if (state() === 'no-tenant') {
        <section class="forge-card empty-state">
          <h3>No team workspace</h3>
          <p>
            Your account isn't linked to a team yet, so there are no rankings to show. Ask your
            admin for an invite.
          </p>
        </section>
      } @else {
        <section class="forge-card board-card">
          <forge-leaderboard
            [entries]="entries()"
            [currentUid]="principal.uid()"
            [period]="period()"
            (periodChange)="period.set($event)"
          />
        </section>
      }
    </div>
  `,
  styles: `
    .head {
      margin-bottom: 24px;
    }

    .head p {
      color: var(--forge-text-subtle);
      margin: 0;
      max-width: 60ch;
    }

    .board-card {
      max-width: 760px;
    }

    .empty-state {
      max-width: 560px;
    }

    .empty-state p {
      color: var(--forge-text-subtle);
      margin: 0;
    }
  `,
})
export class LeaderboardPage {
  protected readonly principal = inject(PrincipalStore);
  private readonly gamification = inject(GamificationData);

  protected readonly state = signal<LeaderboardState>('loading');
  protected readonly period = signal<LeaderboardPeriod>('weekly');
  private readonly live = signal<LiveSnapshot<Leaderboard> | null>(null);

  /** undefined = loading (skeleton); [] = materialized-but-empty or missing doc. */
  protected readonly entries = computed<LeaderboardEntry[] | undefined>(() => {
    const live = this.live();
    if (!live || live.state() === 'loading') return undefined;
    return live.value()?.entries ?? [];
  });

  constructor() {
    this.principal.init();
    effect((onCleanup) => {
      const status = this.principal.status();
      const tenantId = this.principal.tenantId();
      const period = this.period();
      if (status === 'loading') return;
      if (status === 'signedOut' || !tenantId) {
        this.state.set('no-tenant');
        return;
      }
      const live = this.gamification.leaderboard(tenantId, period);
      this.live.set(live);
      this.state.set('ready');
      onCleanup(() => live.unsubscribe());
    });
  }
}
