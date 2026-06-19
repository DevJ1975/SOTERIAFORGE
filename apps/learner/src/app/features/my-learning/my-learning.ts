import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getDoc, getDocs } from 'firebase/firestore';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { PrincipalStore } from '@forge/auth';
import { badgesCol, FIRESTORE, leaderboardDoc, memberDoc } from '@forge/data-access';
import { EnrollmentService, type EnrolledCourse } from '@forge/lms-core';
import { BadgeWall, LeaderboardTable, StreakChip, XpBar } from '@forge/gamification';
import type { Badge, Leaderboard, Member } from '@forge/shared';

/**
 * "My Learning" dashboard: the principal's enrollments and their gamification
 * snapshot (XP/level, streak, badges, all-time leaderboard) for the tenant.
 */
@Component({
  selector: 'app-my-learning',
  imports: [
    RouterLink,
    ButtonModule,
    ProgressBarModule,
    XpBar,
    StreakChip,
    BadgeWall,
    LeaderboardTable,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <header class="page-head">
        <h1>My Learning</h1>
        <p>Your progress, points, and standing across the ATL safety program.</p>
      </header>

      <section class="stats">
        <div class="forge-card stat-card">
          <h3>Experience</h3>
          <forge-xp-bar [xp]="xp()" />
        </div>
        <div class="forge-card stat-card streak">
          <h3>Streak</h3>
          <forge-streak-chip [streakDays]="streakDays()" />
        </div>
      </section>

      <section>
        <h2>Enrolled courses</h2>
        @if (loading()) {
          <p class="muted">Loading…</p>
        } @else if (error()) {
          <div class="forge-card load-error">
            <p class="muted">We couldn't load your learning dashboard. Please try again.</p>
            <p-button label="Retry" icon="pi pi-refresh" (onClick)="load()" />
          </div>
        } @else if (enrolled().length === 0) {
          <div class="forge-card empty">
            <p class="muted">You haven't enrolled in any courses yet.</p>
            <p-button label="Browse the catalog" routerLink="/courses" />
          </div>
        } @else {
          <div class="enroll-grid">
            @for (item of enrolled(); track item.course.id) {
              <article class="forge-card enroll-card">
                <div class="enroll-top">
                  <h3>{{ item.course.title }}</h3>
                  @if (item.enrollment.completed) {
                    <span class="badge-done">Completed</span>
                  }
                </div>
                <p-progressBar
                  [value]="item.enrollment.progressPct"
                  [attr.aria-label]="item.course.title + ' progress'"
                  [attr.aria-valuetext]="item.enrollment.progressPct + '% complete'"
                />
                <p-button
                  [label]="item.enrollment.completed ? 'Review' : 'Continue'"
                  severity="secondary"
                  [routerLink]="['/courses', item.course.id]"
                />
              </article>
            }
          </div>
        }
      </section>

      <section>
        <h2>Badges</h2>
        <forge-badge-wall [badges]="badges()" [earnedIds]="earnedBadgeIds()" />
      </section>

      <section>
        <h2>All-time leaderboard</h2>
        <forge-leaderboard-table
          [entries]="leaderboardEntries()"
          [currentUid]="uid() ?? undefined"
        />
      </section>
    </div>
  `,
  styles: `
    .page-head {
      margin-bottom: 24px;
    }
    .page-head p,
    .muted {
      color: var(--forge-text-subtle);
    }
    section {
      margin-bottom: 32px;
    }
    section h2 {
      margin-bottom: 16px;
    }
    .stats {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    @media (max-width: 700px) {
      .stats {
        grid-template-columns: 1fr;
      }
    }
    .stat-card h3 {
      margin: 0 0 12px;
    }
    .enroll-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }
    .enroll-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .enroll-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .enroll-top h3 {
      margin: 0;
    }
    .badge-done {
      background: var(--forge-positive);
      color: var(--forge-accent-fg, var(--forge-surface));
      border-radius: var(--forge-radius-small);
      padding: 2px 8px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .empty {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }
    .load-error {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      border: 1px solid var(--forge-negative);
    }
  `,
})
export class MyLearning {
  private readonly db = inject(FIRESTORE);
  private readonly enrollments = inject(EnrollmentService);
  private readonly principal = inject(PrincipalStore);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly uid = computed(() => this.principal.uid());

  private readonly enrolledData = signal<EnrolledCourse[]>([]);
  private readonly member = signal<Member | undefined>(undefined);
  private readonly badgeList = signal<Badge[]>([]);
  private readonly leaderboard = signal<Leaderboard | undefined>(undefined);
  private readonly earned = signal<string[]>([]);

  protected readonly enrolled = computed(() => this.enrolledData());
  protected readonly xp = computed(() => this.member()?.xp ?? 0);
  protected readonly streakDays = computed(() => this.member()?.streakDays ?? 0);
  protected readonly badges = computed(() => this.badgeList());
  protected readonly earnedBadgeIds = computed(() => this.earned());
  protected readonly leaderboardEntries = computed(() => this.leaderboard()?.entries ?? []);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    try {
      const [enrolled, memberSnap, badgesSnap, leaderboardSnap] = await Promise.all([
        this.enrollments.listMyEnrollments(tenantId, uid),
        getDoc(memberDoc(this.db, tenantId, uid)),
        getDocs(badgesCol(this.db, tenantId)),
        getDoc(leaderboardDoc(this.db, tenantId, 'allTime')),
      ]);
      const member = memberSnap.exists() ? memberSnap.data() : undefined;
      const badges = badgesSnap.docs.map((d) => d.data());
      this.enrolledData.set(enrolled);
      this.member.set(member);
      this.badgeList.set(badges);
      this.leaderboard.set(leaderboardSnap.exists() ? leaderboardSnap.data() : undefined);
      this.earned.set(this.deriveEarnedBadges(enrolled, badges, member));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Demo heuristic for "which badges are earned" (real grants are written by the
   * Phase-4 rewards Cloud Function):
   *  - course badges: earned when an enrollment with that badge is completed;
   *  - streak badges (id contains "streak"): earned once the member's
   *    `streakDays` clears the threshold implied by the id (default 7).
   * Kept deliberately simple and honest — no badge is shown earned without a
   * concrete signal backing it.
   */
  private deriveEarnedBadges(
    enrolled: EnrolledCourse[],
    badges: Badge[],
    member: Member | undefined,
  ): string[] {
    const earned = new Set<string>();
    for (const e of enrolled) {
      if (e.enrollment.completed) for (const ref of e.course.badgeRefs) earned.add(ref);
    }
    const streakDays = member?.streakDays ?? 0;
    for (const badge of badges) {
      if (badge.id.toLowerCase().includes('streak')) {
        const threshold = this.streakThreshold(badge.id);
        if (streakDays >= threshold) earned.add(badge.id);
      }
    }
    return [...earned];
  }

  /** Pulls the leading number out of a streak badge id (e.g. `7-day-streak` -> 7); defaults to 7. */
  private streakThreshold(badgeId: string): number {
    const match = badgeId.match(/\d+/);
    return match ? Number(match[0]) : 7;
  }
}
