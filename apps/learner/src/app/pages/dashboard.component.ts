import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { AuthService, TenantService } from '@forge/auth';
import { MemberRepository } from '@forge/data-access';
import { XpBadgeComponent } from '@forge/gamification';
import type { Member } from '@forge/shared';

@Component({
  selector: 'forge-dashboard',
  standalone: true,
  imports: [CardModule, RouterLink, XpBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="dash">
      <h1>Welcome{{ name() ? ', ' + name() : '' }}</h1>

      @if (member(); as m) {
        <div class="dash__xp-row">
          <forge-xp-badge [xp]="m.xp" [streakDays]="m.streakDays" />
        </div>
      }

      <p-card header="Your learning">
        <p>Assigned courses, progress, streak and XP will appear here (Phase 2+).</p>
        <div class="dash__links">
          <a routerLink="/courses" class="dash__link">Browse Courses →</a>
          <a routerLink="/leaderboard" class="dash__link">View Leaderboard →</a>
        </div>
      </p-card>
    </section>
  `,
  styles: [
    `
      .dash {
        max-width: 60rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .dash__xp-row {
        margin-bottom: 1rem;
      }
      .dash__links {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .dash__link {
        display: inline-block;
        color: var(--forge-primary, #0b5fff);
        text-decoration: none;
        font-weight: 600;
      }
      .dash__link:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly tenantSvc = inject(TenantService);
  private readonly memberRepo = inject(MemberRepository);

  protected readonly name = computed(() => this.auth.principal()?.displayName ?? '');
  protected readonly member = signal<Member | null>(null);

  async ngOnInit(): Promise<void> {
    const uid = this.auth.principal()?.uid;
    const tenantId = this.tenantSvc.tenantId();
    if (!uid || !tenantId) return;
    try {
      const m = await this.memberRepo.getById(tenantId, uid);
      this.member.set(m);
    } catch (err) {
      console.warn('[DashboardComponent] Failed to load member', err);
    }
  }
}
