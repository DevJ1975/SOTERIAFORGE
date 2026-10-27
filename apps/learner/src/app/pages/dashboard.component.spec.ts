import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ASSURANCE_ENV,
  type AssuranceEnvironment,
  AuthService,
  TenantService,
} from '@assurance/auth';
import { MemberRepository } from '@assurance/data-access';
import { LearningApi } from '@assurance/lms-core';
import { DashboardComponent } from './dashboard.component';
import type { Member } from '@assurance/shared';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

const mockMember: Member = {
  uid: 'user-1',
  tenantId: 'tenant-1',
  role: 'learner',
  status: 'active',
  email: 'alice@example.com',
  displayName: 'Alice Ortega',
  xp: 350,
  level: 2,
  streakDays: 7,
  lastActiveAt: new Date().toISOString(),
  earnedBadgeIds: ['recruit'],
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockAuthService = {
  principal: () => ({
    uid: 'user-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    claims: { role: 'learner' as const, tenantId: 'tenant-1', entitlements: [] },
  }),
};

const mockTenantService = {
  tenantId: () => 'tenant-1',
};

const mockMemberRepository = {
  getById: jest.fn().mockResolvedValue(mockMember),
};

const mockApi = { myEnrollments: jest.fn().mockResolvedValue([]) };

describe('DashboardComponent (Forge Home)', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockApi.myEnrollments.mockResolvedValue([]);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: MemberRepository, useValue: mockMemberRepository },
        { provide: LearningApi, useValue: mockApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    el = fixture.nativeElement;
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('creates the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('greets the learner by first name with a time-of-day greeting', async () => {
    await settle();
    expect(el.querySelector('h1')?.textContent).toMatch(
      /^Good (morning|afternoon|evening), Alice\.$/,
    );
  });

  it('loads member from MemberRepository on init', async () => {
    await settle();
    expect(mockMemberRepository.getById).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('shows the member streak and a 14-day strip in the Pulse card', async () => {
    await settle();
    const pulse = el.querySelector('assurance-home-pulse-card') as HTMLElement;
    expect(pulse.querySelector('.hp__num')?.textContent).toBe('7');
    const strip = pulse.querySelector('sf-streak-strip') as HTMLElement;
    expect(strip.querySelectorAll('.sf-streak__day').length).toBe(14);
    expect(strip.querySelectorAll('.sf-streak__day.is-done').length).toBe(7);
    expect(strip.getAttribute('aria-label')).toBe('Active 7 of the last 14 days');
  });

  it('renders the Continue card with a progress ring and a Resume action', async () => {
    await settle();
    const card = el.querySelector('assurance-home-continue-card') as HTMLElement;
    expect(card.querySelector('sf-progress-ring')?.getAttribute('aria-valuenow')).toBe('56');
    const resume = card.querySelector('a.sf-btn--primary') as HTMLAnchorElement;
    expect(resume.textContent).toContain('Resume Module 5.1');
  });

  function enrollment(over: Record<string, unknown>) {
    return {
      id: 'e1',
      courseId: 'c1',
      memberId: 'user-1',
      assigned: false,
      dueAt: null,
      progressPct: 40,
      completedAt: null,
      lastActivityAt: '2026-01-02T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      course: { id: 'c1', title: 'Real Course' },
      nextLesson: {
        id: 'l1',
        title: 'Lesson One',
        moduleTitle: 'Basics',
        moduleLabel: 'Week 2',
        estimatedMinutes: 9,
      },
      ...over,
    };
  }

  it('shows the most recently active unfinished enrollment on the Continue card', async () => {
    mockApi.myEnrollments.mockResolvedValue([
      enrollment({ id: 'old', lastActivityAt: '2025-01-01T00:00:00Z' }),
      enrollment({
        id: 'done',
        completedAt: '2026-02-01T00:00:00Z',
        lastActivityAt: '2026-03-01T00:00:00Z',
      }),
      enrollment({
        id: 'new',
        courseId: 'c2',
        lastActivityAt: null,
        createdAt: '2026-02-01T00:00:00Z',
        course: { id: 'c2', title: 'Newest Course' },
        nextLesson: {
          id: 'l9',
          title: 'Intro',
          moduleTitle: 'Start',
          moduleLabel: '',
          estimatedMinutes: null,
        },
        progressPct: 10,
      }),
    ]);
    await settle();
    const card = el.querySelector('assurance-home-continue-card') as HTMLElement;
    expect(card.textContent).toContain('Newest Course');
    expect(card.textContent).toContain('Course');
    const resume = card.querySelector('a.sf-btn--primary') as HTMLAnchorElement;
    expect(resume.textContent).toContain('Resume Intro');
    expect(resume.getAttribute('href')).toBe('/courses/c2/lessons/l9');
    expect(card.textContent).not.toContain('min left');
    expect(el.querySelector('assurance-home-pulse-card')?.textContent).toContain('ready');
  });

  it('builds subtitle and time left from the next lesson', async () => {
    mockApi.myEnrollments.mockResolvedValue([enrollment({})]);
    await settle();
    const card = el.querySelector('assurance-home-continue-card') as HTMLElement;
    expect(card.textContent).toContain('Week 2 · Basics');
    expect(card.textContent).toContain('9 min left');
  });

  it('keeps the placeholder and does not claim a lesson is ready when the request fails', async () => {
    mockApi.myEnrollments.mockRejectedValue(new Error('boom'));
    await settle();
    const card = el.querySelector('assurance-home-continue-card') as HTMLElement;
    expect(card.textContent).toContain('AI Cyber Defender');
    expect(el.querySelector('assurance-home-pulse-card')?.textContent).not.toContain('ready');
  });

  it('renders Next live session with crew check-in', async () => {
    await settle();
    const card = el.querySelector('assurance-home-live-session-card') as HTMLElement;
    expect(card.textContent).toContain('Lab Day · Forge Engage');
    expect(card.textContent).toContain('Today, 6:00');
    expect(card.textContent).toContain('Crew Alpha · 5 checked in');
  });

  it('gives every This-week state a word, not colour alone', async () => {
    await settle();
    const rows = Array.from(el.querySelectorAll('assurance-home-week-card li'));
    expect(rows.length).toBe(5);
    const words = rows.map((r) => r.querySelector('.sf-visually-hidden')?.textContent?.trim());
    expect(words).toEqual(['Done:', 'Done:', 'Today:', 'Upcoming:', 'Upcoming:']);
  });

  it('resolves mission badges from member.earnedBadgeIds, each with a state word', async () => {
    await settle();
    const card = el.querySelector('assurance-home-badges-card') as HTMLElement;
    expect(card.querySelector('.hb__count')?.textContent?.trim()).toBe('1 of 8 earned');
    const metas = Array.from(card.querySelectorAll('.sf-badge__meta')).map((m) =>
      m.textContent?.trim(),
    );
    expect(metas[0]).toBe('Earned');
    expect(metas).toContain('In progress');
    expect(metas).toContain('Locked');
  });

  it('shows the AI coach sources and lets the learner defer the nudge', async () => {
    await settle();
    const card = el.querySelector('assurance-home-coach-card') as HTMLElement;
    expect(card.textContent).toContain('never grades');
    expect(card.querySelector('.hk__sources')?.textContent).toContain('Knowledge check 4');
    const later = Array.from(card.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Later'),
    ) as HTMLButtonElement;
    later.click();
    fixture.detectChanges();
    expect(card.querySelector('.hk__sources')).toBeNull();
    expect(card.textContent).toContain('Ask Forge any time');
  });

  it('uses kit icons, never emoji', async () => {
    await settle();
    expect(el.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
