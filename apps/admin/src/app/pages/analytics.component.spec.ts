import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GamificationAdminApi, LearningApi } from '@assurance/lms-core';
import {
  ReportsApi,
  type AtRiskLearner,
  type AtRiskReport,
  type TenantAnalytics,
} from '@assurance/tenant';
import { AnalyticsComponent, reasonLabel } from './analytics.component';

const rules = { inactiveDays: 7, behindPoints: 25, firstTryPct: 60, missedSessions: 2 };

const analyticsData = (over: Partial<TenantAnalytics> = {}): TenantAnalytics => ({
  generatedAt: '2026-11-21T15:00:00Z',
  totals: {
    learners: 20,
    activeLast7Days: 14,
    enrollments: 24,
    completions: 6,
    completionRate: 25,
    averageProgressPct: 48,
    firstTryPct: 71,
  },
  courses: [
    {
      courseId: 'c1',
      title: 'Lockout Tagout',
      enrollments: 24,
      completions: 6,
      averageProgressPct: 48,
    },
  ],
  lessons: [],
  weeks: [
    { weekStart: '2026-11-09', activeLearners: 5, lessonsCompleted: 12 },
    { weekStart: '2026-11-16', activeLearners: 10, lessonsCompleted: 30 },
  ],
  ...over,
});

const learner = (over: Partial<AtRiskLearner> = {}): AtRiskLearner => ({
  memberId: 'm1',
  memberName: 'Marcus Reed',
  email: 'marcus@example.com',
  cohortName: 'Cohort 1',
  crewName: 'Crew B',
  progressPct: 10,
  lastActivityAt: null,
  firstTryPct: 40,
  sessionsMissed: 3,
  reasons: ['inactive', 'low_scores', 'missed_sessions'],
  ...over,
});

const riskData = (learners: AtRiskLearner[]): AtRiskReport => ({
  generatedAt: '2026-11-21T15:00:00Z',
  rules,
  learners,
});

describe('AnalyticsComponent', () => {
  let fixture: ComponentFixture<AnalyticsComponent>;
  const analytics = jest.fn();
  const atRisk = jest.fn();
  const courses = jest.fn();
  const cohorts = jest.fn();
  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [
        provideRouter([]),
        { provide: ReportsApi, useValue: { analytics, atRisk } },
        { provide: LearningApi, useValue: { courses } },
        { provide: GamificationAdminApi, useValue: { cohorts } },
      ],
    });
    fixture = TestBed.createComponent(AnalyticsComponent);
    await settle();
  }

  beforeEach(() => {
    analytics.mockReset().mockResolvedValue(analyticsData());
    atRisk.mockReset().mockResolvedValue(riskData([learner()]));
    courses.mockReset().mockResolvedValue([{ id: 'c1', title: 'Lockout Tagout' }]);
    cohorts
      .mockReset()
      .mockResolvedValue([{ id: 'k1', name: 'Cohort 1', startsOn: null, endsOn: null }]);
  });

  it('shows totals, weekly activity and the course table', async () => {
    await create();
    expect(analytics).toHaveBeenCalledWith({ courseId: null, cohortId: null });
    expect(text()).toContain('Active in the last 7 days');
    expect(text()).toContain('6 (25%)');
    expect(text()).toContain('71%');
    const tables = el().querySelectorAll('table');
    expect(tables).toHaveLength(2);
    expect(tables[0].querySelectorAll('tbody tr')).toHaveLength(2);
    // Bars scale against the busiest week and stay out of the accessibility tree.
    const bars = tables[0].querySelectorAll<HTMLElement>('.an__bar');
    expect(bars[0].style.width).toBe('50%');
    expect(bars[2].style.width).toBe('100%');
    expect(bars[0].getAttribute('aria-hidden')).toBe('true');
    expect(text()).toContain('Lockout Tagout');
  });

  it('lists at-risk learners with plain-language reasons from the server rules', async () => {
    await create();
    expect(text()).toContain('Marcus Reed');
    expect(text()).toContain('Cohort 1');
    expect(text()).toContain('Last active never');
    const chips = Array.from(el().querySelectorAll('.an__chips li')).map((c) =>
      c.textContent?.trim(),
    );
    expect(chips).toEqual([
      'No activity in 7 days',
      'First-try scores under 60%',
      'Missed 3 recent live sessions',
    ]);
  });

  it('labels every reason', () => {
    expect(reasonLabel('overdue', rules)).toBe('Past due');
    expect(reasonLabel('behind', rules)).toBe('Behind the group by 25+ points');
    expect(reasonLabel('missed_sessions', rules)).toBe('Missed 2+ live sessions');
  });

  it('reloads with the chosen course and cohort and shows the lesson table', async () => {
    await create();
    analytics.mockResolvedValue(
      analyticsData({
        lessons: [
          {
            lessonId: 'l1',
            title: 'Apply the lock',
            moduleTitle: 'Module 1',
            completions: 3,
            enrollments: 24,
            firstTryPct: null,
          },
        ],
      }),
    );
    fixture.componentInstance.setCourse('c1');
    fixture.componentInstance.setCohort('k1');
    await settle();
    expect(analytics).toHaveBeenLastCalledWith({ courseId: 'c1', cohortId: 'k1' });
    expect(atRisk).toHaveBeenLastCalledWith({ courseId: 'c1', cohortId: 'k1' });
    expect(text()).toContain('Apply the lock');
    expect(text()).toContain('3 of 24');
    expect(text()).toContain('No answers yet');
  });

  it('says so when nobody is flagged', async () => {
    atRisk.mockResolvedValue(riskData([]));
    await create();
    expect(text()).toContain('No learners are flagged');
  });

  it('shows each failure without hiding the other report', async () => {
    atRisk.mockImplementation(async () => {
      throw new HttpErrorResponse({ status: 403, error: { detail: 'Staff only.' } });
    });
    await create();
    expect(text()).toContain('Staff only.');
    expect(text()).toContain('Average progress');

    analytics.mockImplementation(async () => {
      throw new Error('offline');
    });
    await fixture.componentInstance.load();
    fixture.detectChanges();
    expect(text()).toContain('Could not load analytics.');
    expect(el().querySelector('table')).toBeNull();
  });

  it('still loads when the filter lists fail', async () => {
    courses.mockImplementation(async () => {
      throw new Error('offline');
    });
    await create();
    expect(text()).toContain('Marcus Reed');
  });
});
