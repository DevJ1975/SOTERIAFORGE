import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { PrincipalStore } from '@forge/auth';
import {
  ForgeBadgeWall,
  ForgeStreakFlame,
  ForgeXpRing,
  GamificationData,
  levelProgress,
  type LiveSnapshot,
  type BadgeAward,
} from '@forge/gamification';
import { ForgeCatalog, ForgeEnrollment } from '@forge/lms-core';
import type { Member } from '@forge/shared';

type ProfileState = 'loading' | 'ready' | 'no-tenant';

interface CourseStats {
  completed: number;
  total: number;
}

/**
 * Learner profile: live XP ring + streak flame off the member doc, the badge
 * wall (earned awards merged onto the platform catalog), and quick course
 * stats from enrollments. Recent XP events are intentionally NOT shown here —
 * that surface belongs to the backend gamification work.
 */
@Component({
  selector: 'app-profile-page',
  imports: [ForgeXpRing, ForgeStreakFlame, ForgeBadgeWall],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="head">
        <h1>My Profile</h1>
        <p>Your forge record — XP, streak, and the badges you've earned along the way.</p>
      </section>

      @if (state() === 'no-tenant') {
        <section class="forge-card empty-state">
          <h3>No team workspace</h3>
          <p>
            Your account isn't linked to a team yet, so there's no progress to show. Ask your admin
            for an invite.
          </p>
        </section>
      } @else {
        <div class="profile-grid">
          <section class="forge-card progress-card">
            <h2>Progress</h2>
            <div class="rings">
              <forge-xp-ring [xp]="xp()" [size]="170" />
              <forge-streak-flame [days]="streakDays()" />
            </div>
            <dl class="stats">
              <div class="stat">
                <dt>Total XP</dt>
                <dd>{{ xp() }}</dd>
              </div>
              <div class="stat">
                <dt>Level</dt>
                <dd>{{ level() }}</dd>
              </div>
              @if (courseStats(); as stats) {
                <div class="stat">
                  <dt>Courses completed</dt>
                  <dd>
                    {{ stats.completed }}<span class="of">/ {{ stats.total }}</span>
                  </dd>
                </div>
              }
            </dl>
          </section>

          <section class="forge-card badges-card">
            <h2>Badges</h2>
            <forge-badge-wall [awards]="awards()" (verify)="onVerify($event)" />
          </section>
        </div>
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

    .profile-grid {
      display: grid;
      grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
      gap: 24px;
      align-items: start;
    }

    @media (max-width: 900px) {
      .profile-grid {
        grid-template-columns: 1fr;
      }
    }

    .progress-card h2,
    .badges-card h2 {
      margin-top: 0;
    }

    .rings {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      margin-bottom: 20px;
    }

    .stats {
      display: grid;
      gap: 8px;
      margin: 0;
    }

    .stat {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 8px 12px;
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius);
      background: var(--forge-surface-dim);
    }

    .stat dt {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--forge-text-subtle);
    }

    .stat dd {
      margin: 0;
      font-family: var(--forge-font-display);
      font-size: 20px;
      font-weight: 600;
    }

    .stat .of {
      font-size: 13px;
      color: var(--forge-text-subtle);
      margin-left: 4px;
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
export class ProfilePage {
  private readonly db = inject(Firestore);
  private readonly principal = inject(PrincipalStore);
  private readonly gamification = inject(GamificationData);
  private readonly catalog = inject(ForgeCatalog);
  private readonly enrollments = inject(ForgeEnrollment);

  protected readonly state = signal<ProfileState>('loading');
  private readonly memberLive = signal<LiveSnapshot<Member> | null>(null);
  private readonly awardsLive = signal<LiveSnapshot<BadgeAward[]> | null>(null);
  /** Completed/total published courses; null while loading or on failure. */
  protected readonly courseStats = signal<CourseStats | null>(null);

  protected readonly xp = computed(() => this.memberLive()?.value()?.xp ?? 0);
  protected readonly streakDays = computed(() => this.memberLive()?.value()?.streakDays ?? 0);
  protected readonly level = computed(() => levelProgress(this.xp()).level);
  protected readonly awards = computed(() => this.awardsLive()?.value() ?? []);

  /** Guards the load effect against re-running for the same principal. */
  private loadedFor: string | null = null;

  constructor() {
    this.principal.init();
    effect((onCleanup) => {
      const status = this.principal.status();
      const tenantId = this.principal.tenantId();
      const uid = this.principal.uid();
      if (status === 'loading') return;
      if (status === 'signedOut' || !tenantId || !uid) {
        this.state.set('no-tenant');
        return;
      }
      const key = `${tenantId}:${uid}`;
      if (this.loadedFor === key) return;
      this.loadedFor = key;

      const member = this.gamification.member(tenantId, uid);
      const awards = this.gamification.awards(tenantId, uid);
      this.memberLive.set(member);
      this.awardsLive.set(awards);
      this.state.set('ready');
      onCleanup(() => {
        member.unsubscribe();
        awards.unsubscribe();
      });

      void this.loadCourseStats(tenantId, uid);
    });
  }

  /**
   * Badge verification stub: the Open Badges 3.0 credential viewer/verifier
   * ships in Phase 4.1; for now the affordance just surfaces the badge id.
   */
  protected onVerify(badgeId: string): void {
    console.info(`[profile] verify badge '${badgeId}' — credential verification lands in 4.1`);
  }

  /**
   * Quick stat: completed vs. published course count, derived from the same
   * per-course enrollment reads the catalog page uses. Best-effort — any
   * failure simply hides the stat.
   */
  private async loadCourseStats(tenantId: string, uid: string): Promise<void> {
    try {
      const published = await this.catalog.listPublished(this.db, tenantId);
      const enrollments = await Promise.all(
        published.map((course) => this.enrollments.get(this.db, tenantId, course.id, uid)),
      );
      this.courseStats.set({
        completed: enrollments.filter((enrollment) => enrollment?.completed).length,
        total: published.length,
      });
    } catch (error) {
      console.warn('[profile] course stats unavailable', error);
      this.courseStats.set(null);
    }
  }
}
