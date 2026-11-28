import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  GamificationAdminApi,
  LearningApi,
  apiErrorMessage,
  type ApiCohort,
  type ApiCourse,
} from '@assurance/lms-core';
import {
  ReportsApi,
  type AtRiskLearner,
  type AtRiskReason,
  type AtRiskReport,
  type AtRiskRules,
  type TenantAnalytics,
} from '@assurance/tenant';

/** Plain-language label for an at-risk reason, using the server's thresholds. */
export function reasonLabel(
  reason: AtRiskReason,
  rules: AtRiskRules,
  learner?: Pick<AtRiskLearner, 'sessionsMissed'>,
): string {
  switch (reason) {
    case 'inactive':
      return `No activity in ${rules.inactiveDays} days`;
    case 'overdue':
      return 'Past due';
    case 'behind':
      return `Behind the group by ${rules.behindPoints}+ points`;
    case 'low_scores':
      return `First-try scores under ${rules.firstTryPct}%`;
    case 'missed_sessions':
      return learner && learner.sessionsMissed > 0
        ? `Missed ${learner.sessionsMissed} recent live sessions`
        : `Missed ${rules.missedSessions}+ live sessions`;
    default:
      return reason;
  }
}

/**
 * Instructor analytics (platform Phase 6): totals, weekly activity, per-course and
 * per-lesson progress, and the at-risk list. The at-risk rules are fixed thresholds the
 * server reports back, so every flag here can be explained to the learner.
 */
@Component({
  selector: 'assurance-admin-analytics',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="an">
      <a routerLink="/">Back to admin</a>
      <h1>Analytics</h1>
      <p>Progress and activity for your learners, and who may need a check-in.</p>

      <div class="an__filters">
        <label>
          Course
          <select name="course" [ngModel]="courseId()" (ngModelChange)="setCourse($event)">
            <option value="">All courses</option>
            @for (course of courses(); track course.id) {
              <option [value]="course.id">{{ course.title }}</option>
            }
          </select>
        </label>
        <label>
          Cohort
          <select name="cohort" [ngModel]="cohortId()" (ngModelChange)="setCohort($event)">
            <option value="">All cohorts</option>
            @for (cohort of cohorts(); track cohort.id) {
              <option [value]="cohort.id">{{ cohort.name }}</option>
            }
          </select>
        </label>
        <button type="button" [disabled]="loading()" (click)="load()">Refresh</button>
      </div>

      @if (error()) {
        <p role="alert" class="an__error">{{ error() }}</p>
      }
      @if (loading() && !analytics()) {
        <p role="status">Loading analytics…</p>
      }

      @if (analytics(); as data) {
        <p class="an__meta">Updated {{ data.generatedAt | date: 'medium' }}</p>
        <dl class="an__tiles">
          <div>
            <dt>Learners</dt>
            <dd>{{ data.totals.learners }}</dd>
          </div>
          <div>
            <dt>Active in the last 7 days</dt>
            <dd>{{ data.totals.activeLast7Days }}</dd>
          </div>
          <div>
            <dt>Enrollments</dt>
            <dd>{{ data.totals.enrollments }}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{{ data.totals.completions }} ({{ data.totals.completionRate }}%)</dd>
          </div>
          <div>
            <dt>Average progress</dt>
            <dd>{{ data.totals.averageProgressPct }}%</dd>
          </div>
          <div>
            <dt>Correct on first try</dt>
            <dd>{{ pct(data.totals.firstTryPct) }}</dd>
          </div>
        </dl>

        <h2 id="an-weeks">Weekly activity</h2>
        @if (data.weeks.length) {
          <table class="an__table" aria-labelledby="an-weeks">
            <thead>
              <tr>
                <th scope="col">Week of</th>
                <th scope="col">Active learners</th>
                <th scope="col">Lessons completed</th>
              </tr>
            </thead>
            <tbody>
              @for (week of data.weeks; track week.weekStart) {
                <tr>
                  <th scope="row">{{ week.weekStart | date: 'mediumDate' : 'UTC' }}</th>
                  <td>
                    <span class="an__num">{{ week.activeLearners }}</span>
                    <span
                      class="an__bar"
                      aria-hidden="true"
                      [style.width.%]="share(week.activeLearners, maxActive())"
                    ></span>
                  </td>
                  <td>
                    <span class="an__num">{{ week.lessonsCompleted }}</span>
                    <span
                      class="an__bar an__bar--alt"
                      aria-hidden="true"
                      [style.width.%]="share(week.lessonsCompleted, maxLessons())"
                    ></span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p>No activity yet.</p>
        }

        <h2 id="an-courses">Courses</h2>
        @if (data.courses.length) {
          <table class="an__table" aria-labelledby="an-courses">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Enrolled</th>
                <th scope="col">Completed</th>
                <th scope="col">Average progress</th>
              </tr>
            </thead>
            <tbody>
              @for (course of data.courses; track course.courseId) {
                <tr>
                  <th scope="row">{{ course.title }}</th>
                  <td>{{ course.enrollments }}</td>
                  <td>{{ course.completions }}</td>
                  <td>{{ course.averageProgressPct }}%</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p>No enrollments match these filters.</p>
        }

        @if (courseId()) {
          <h2 id="an-lessons">Lessons in this course</h2>
          @if (data.lessons.length) {
            <table class="an__table" aria-labelledby="an-lessons">
              <thead>
                <tr>
                  <th scope="col">Lesson</th>
                  <th scope="col">Module</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Correct on first try</th>
                </tr>
              </thead>
              <tbody>
                @for (lesson of data.lessons; track lesson.lessonId) {
                  <tr>
                    <th scope="row">{{ lesson.title }}</th>
                    <td>{{ lesson.moduleTitle }}</td>
                    <td>{{ lesson.completions }} of {{ lesson.enrollments }}</td>
                    <td>{{ pct(lesson.firstTryPct) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p>This course has no lessons yet.</p>
          }
        }
      }

      <h2 id="an-risk">At-risk learners</h2>
      @if (riskError()) {
        <p role="alert" class="an__error">{{ riskError() }}</p>
      }
      @if (atRisk(); as risk) {
        <p>
          A learner is listed when any of these is true: no activity in
          {{ risk.rules.inactiveDays }} days, an assignment past due, progress
          {{ risk.rules.behindPoints }} or more points behind the group, first-try scores under
          {{ risk.rules.firstTryPct }}%, or {{ risk.rules.missedSessions }} or more recent live
          sessions missed.
        </p>
        @if (risk.learners.length) {
          <ul class="an__risk" aria-labelledby="an-risk">
            @for (learner of risk.learners; track learner.memberId) {
              <li>
                <p class="an__name">
                  <strong>{{ learner.memberName || learner.email }}</strong>
                  <span>{{ learner.email }}</span>
                </p>
                <p class="an__meta">
                  @if (learner.cohortName) {
                    {{ learner.cohortName }}
                    @if (learner.crewName) {
                      · {{ learner.crewName }}
                    }
                    ·
                  }
                  Progress {{ learner.progressPct }}% · Last active
                  {{
                    learner.lastActivityAt ? (learner.lastActivityAt | date: 'mediumDate') : 'never'
                  }}
                  @if (learner.firstTryPct !== null) {
                    · First try {{ learner.firstTryPct }}%
                  }
                </p>
                <ul class="an__chips" [attr.aria-label]="'Reasons for ' + learner.memberName">
                  @for (reason of learner.reasons; track reason) {
                    <li>{{ label(reason, risk, learner) }}</li>
                  }
                </ul>
              </li>
            }
          </ul>
        } @else {
          <p role="status">No learners are flagged with these filters.</p>
        }
      } @else if (loading()) {
        <p role="status">Loading the at-risk list…</p>
      }
    </section>
  `,
  styles: [
    `
      .an {
        max-width: 68rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .an__filters {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: end;
        margin: 1rem 0;
      }
      .an__filters label {
        display: grid;
        gap: 0.25rem;
      }
      .an select,
      .an button {
        min-height: 44px;
        font: inherit;
      }
      .an__error {
        color: #b00020;
      }
      .an__meta {
        margin: 0.25rem 0;
        font-size: 0.875rem;
        color: #4b5563;
      }
      .an__tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.75rem;
        margin: 1rem 0 1.5rem;
      }
      .an__tiles div {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 0.75rem;
        background: #fff;
      }
      .an__tiles dt {
        font-size: 0.8125rem;
        color: #4b5563;
      }
      .an__tiles dd {
        margin: 0.25rem 0 0;
        font-size: 1.375rem;
        font-weight: 700;
      }
      .an__table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1.5rem;
        background: #fff;
      }
      .an__table th,
      .an__table td {
        text-align: left;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: middle;
      }
      .an__num {
        display: inline-block;
        min-width: 2.5rem;
      }
      .an__bar {
        display: inline-block;
        height: 0.625rem;
        max-width: calc(100% - 3rem);
        border-radius: 999px;
        background: #1d4ed8;
        vertical-align: middle;
      }
      .an__bar--alt {
        background: #047857;
      }
      .an__risk {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.75rem;
      }
      .an__risk > li {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 0.875rem 1rem;
        background: #fff;
      }
      .an__name {
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: baseline;
      }
      .an__name span {
        color: #4b5563;
        font-size: 0.875rem;
        overflow-wrap: anywhere;
      }
      .an__chips {
        list-style: none;
        margin: 0.5rem 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
      }
      .an__chips li {
        padding: 0.125rem 0.625rem;
        border: 1px solid #b45309;
        border-radius: 999px;
        background: #fffbeb;
        color: #7c2d12;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class AnalyticsComponent implements OnInit {
  private readonly reports = inject(ReportsApi);
  private readonly learning = inject(LearningApi);
  private readonly gamification = inject(GamificationAdminApi);

  protected readonly courses = signal<ApiCourse[]>([]);
  protected readonly cohorts = signal<ApiCohort[]>([]);
  readonly courseId = signal('');
  readonly cohortId = signal('');
  readonly analytics = signal<TenantAnalytics | null>(null);
  readonly atRisk = signal<AtRiskReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly riskError = signal('');
  private request = 0;

  protected readonly maxActive = computed(() =>
    Math.max(0, ...(this.analytics()?.weeks ?? []).map((w) => w.activeLearners)),
  );
  protected readonly maxLessons = computed(() =>
    Math.max(0, ...(this.analytics()?.weeks ?? []).map((w) => w.lessonsCompleted)),
  );

  ngOnInit(): void {
    void this.loadFilters();
    void this.load();
  }

  setCourse(courseId: string): void {
    this.courseId.set(courseId);
    void this.load();
  }

  setCohort(cohortId: string): void {
    this.cohortId.set(cohortId);
    void this.load();
  }

  /** Filters are a convenience: the reports still load if either list fails. */
  private async loadFilters(): Promise<void> {
    const [courses, cohorts] = await Promise.allSettled([
      this.learning.courses(),
      this.gamification.cohorts(),
    ]);
    if (courses.status === 'fulfilled') this.courses.set(courses.value);
    if (cohorts.status === 'fulfilled') this.cohorts.set(cohorts.value);
  }

  async load(): Promise<void> {
    const request = ++this.request;
    const scope = { courseId: this.courseId() || null, cohortId: this.cohortId() || null };
    this.loading.set(true);
    this.error.set('');
    this.riskError.set('');
    const [analytics, atRisk] = await Promise.allSettled([
      this.reports.analytics(scope),
      this.reports.atRisk(scope),
    ]);
    if (request !== this.request) return;
    if (analytics.status === 'fulfilled') {
      this.analytics.set(analytics.value);
    } else {
      this.analytics.set(null);
      this.error.set(apiErrorMessage(analytics.reason, 'Could not load analytics.'));
    }
    if (atRisk.status === 'fulfilled') {
      this.atRisk.set(atRisk.value);
    } else {
      this.atRisk.set(null);
      this.riskError.set(apiErrorMessage(atRisk.reason, 'Could not load the at-risk list.'));
    }
    this.loading.set(false);
  }

  protected pct(value: number | null): string {
    return value === null ? 'No answers yet' : `${value}%`;
  }

  protected share(value: number, max: number): number {
    return max > 0 ? Math.round((value / max) * 100) : 0;
  }

  protected label(reason: AtRiskReason, risk: AtRiskReport, learner: AtRiskLearner): string {
    return reasonLabel(reason, risk.rules, learner);
  }
}
