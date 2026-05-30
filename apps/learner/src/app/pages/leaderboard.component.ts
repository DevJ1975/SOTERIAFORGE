import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantService } from '@forge/auth';
import { LeaderboardComponent } from '@forge/gamification';

@Component({
  selector: 'forge-leaderboard-page',
  standalone: true,
  imports: [RouterLink, LeaderboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="leaderboard-page" aria-labelledby="leaderboard-heading">
      <h1 id="leaderboard-heading" class="sr-only">Leaderboard</h1>
      <nav class="leaderboard-page__nav" aria-label="Page navigation">
        <a routerLink="/">← Back to Dashboard</a>
      </nav>

      @if (tenantId(); as tid) {
        <forge-leaderboard [tenantId]="tid" period="allTime" />
      } @else {
        <p>Tenant not resolved.</p>
      }
    </section>
  `,
  styles: [
    `
      .leaderboard-page {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .leaderboard-page__nav {
        margin-bottom: 1.5rem;
      }
      .leaderboard-page__nav a {
        color: var(--forge-primary, #0b5fff);
        text-decoration: none;
        font-weight: 500;
      }
      .leaderboard-page__nav a:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class LeaderboardPageComponent {
  private readonly tenantSvc = inject(TenantService);
  protected readonly tenantId = this.tenantSvc.tenantId;
}
