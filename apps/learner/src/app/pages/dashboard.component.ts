import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LearningApi } from '@assurance/lms-core';
import { streakStrip } from '@assurance/gamification';
import { LearnerProfileStore } from '../services/learner-profile.store';
import { HomeBadgesCardComponent } from './home/badges-card.component';
import { HomeCoachCardComponent } from './home/coach-card.component';
import { HomeContinueCardComponent } from './home/continue-card.component';
import { HomeLiveSessionCardComponent } from './home/live-session-card.component';
import { HomePulseCardComponent } from './home/pulse-card.component';
import { HomeWeekCardComponent } from './home/week-card.component';
import {
  type ContinueLearning,
  type PulseToday,
  buildContinueLearning,
  formatTimeWithZone,
  greetingFor,
  isSameLocalDay,
  pickContinueEnrollment,
  resolveBadgeStates,
} from './home/home.models';
import {
  HOME_PLACEHOLDER_BADGES,
  HOME_PLACEHOLDER_COACH,
  HOME_PLACEHOLDER_CONTINUE,
  HOME_PLACEHOLDER_DAY_THEME,
  HOME_PLACEHOLDER_WEEK,
  homePlaceholderLiveSession,
} from './home/home.placeholders';

const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/**
 * Learner Home (Soteria Forge, forge_home.jpg).
 *
 * Real data: name, streak, 14-day strip and earned badges come from the
 * member doc via LearnerProfileStore; the Continue card comes from the
 * learning API (falls back to the placeholder when there is nothing to resume). Everything else is a typed design
 * placeholder from ./home/home.placeholders.ts until its data source exists.
 */
@Component({
  selector: 'assurance-dashboard',
  standalone: true,
  imports: [
    HomeContinueCardComponent,
    HomePulseCardComponent,
    HomeLiveSessionCardComponent,
    HomeWeekCardComponent,
    HomeBadgesCardComponent,
    HomeCoachCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="home__greet">
      <h1 class="sf-h1" id="home-h">{{ greeting() }}</h1>
      <p class="sf-sub sf-sub--on-canvas home__date">{{ dateLine() }}</p>
    </div>

    <div class="home__row home__row--top">
      <assurance-home-continue-card [data]="continueLearning()" />
      <assurance-home-pulse-card [streakDays]="streakDays()" [days]="strip()" [data]="pulse()" />
      <assurance-home-live-session-card [session]="session" [now]="now" />
    </div>

    <div class="home__row home__row--mid">
      <assurance-home-week-card [items]="week" />
      <assurance-home-badges-card [badges]="badges()" />
    </div>

    <assurance-home-coach-card class="home__coach" [nudge]="coach" />
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 90rem;
      }
      .home__greet {
        margin-bottom: 28px;
      }
      .home__date {
        margin: 6px 0 0;
      }
      .home__row {
        display: grid;
        gap: var(--sf-space-6);
        margin-bottom: var(--sf-space-6);
      }
      .home__row--top {
        grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr);
      }
      .home__row--mid {
        grid-template-columns: minmax(0, 1.6fr) minmax(0, 2fr);
      }
      .home__coach {
        max-width: 40rem;
      }
      @media (max-width: 80rem) {
        .home__row--top {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .home__row--top > :first-child {
          grid-column: 1 / -1;
        }
      }
      @media (max-width: 64rem) {
        .home__row--mid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (max-width: 40rem) {
        .home__row--top {
          grid-template-columns: minmax(0, 1fr);
        }
        .home__row {
          gap: var(--sf-space-4);
          margin-bottom: var(--sf-space-4);
        }
        .home__greet .sf-h1 {
          font-size: 24px;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  private readonly profile = inject(LearnerProfileStore);
  private readonly api = inject(LearningApi);

  protected readonly now = new Date();

  // Typed design placeholders (see ./home/home.placeholders.ts).
  protected readonly continueLearning = signal<ContinueLearning>(HOME_PLACEHOLDER_CONTINUE);
  private readonly hasRealLesson = signal(false);
  protected readonly pulse = computed<PulseToday>(() => ({
    message: this.hasRealLesson()
      ? 'Your next lesson is ready'
      : 'Enroll in a course to get started',
  }));
  protected readonly session = homePlaceholderLiveSession(this.now);
  protected readonly week = HOME_PLACEHOLDER_WEEK;
  protected readonly coach = HOME_PLACEHOLDER_COACH;

  // Real member data.
  protected readonly member = this.profile.member;
  protected readonly greeting = computed(() => {
    const first = this.profile.firstName();
    return `${greetingFor(this.now)}${first ? ', ' + first : ''}.`;
  });
  protected readonly streakDays = computed(() => this.member()?.streakDays ?? 0);
  protected readonly strip = computed(() => {
    const m = this.member();
    return streakStrip(m?.streakDays ?? 0, m?.lastActiveAt, this.now.toISOString(), 14);
  });
  protected readonly badges = computed(() =>
    resolveBadgeStates(HOME_PLACEHOLDER_BADGES, this.member()?.earnedBadgeIds ?? null),
  );

  protected readonly dateLine = computed(() => {
    const parts = [longDate.format(this.now), HOME_PLACEHOLDER_DAY_THEME];
    if (isSameLocalDay(this.session.startsAt, this.now)) {
      parts.push(`Live session at ${formatTimeWithZone(this.session.startsAt)}`);
    }
    return parts.join(' · ');
  });

  ngOnInit(): void {
    void this.profile.load();
    void this.loadContinue();
  }

  /** Real Continue card; on no enrollment or any failure the placeholder stays. */
  private async loadContinue(): Promise<void> {
    try {
      const pick = pickContinueEnrollment(await this.api.myEnrollments());
      if (pick) {
        this.continueLearning.set(buildContinueLearning(pick));
        this.hasRealLesson.set(true);
      }
    } catch {
      // Keep the placeholder so Home never breaks.
    }
  }
}
