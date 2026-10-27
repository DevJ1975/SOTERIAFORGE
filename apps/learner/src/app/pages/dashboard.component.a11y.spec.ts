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
import { axe, toHaveNoViolations } from 'jest-axe';
import { DashboardComponent } from './dashboard.component';
import type { Member } from '@assurance/shared';

expect.extend(toHaveNoViolations);

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
  displayName: 'Alice',
  xp: 350,
  level: 2,
  streakDays: 7,
  earnedBadgeIds: [],
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

describe('DashboardComponent – accessibility', () => {
  let fixture: ComponentFixture<DashboardComponent>;

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
    fixture.detectChanges();
    // Let ngOnInit async resolve
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('has no axe violations', async () => {
    const results = await axe(fixture.nativeElement);
    expect(results).toHaveNoViolations();
  });

  it('has a single <h1>', () => {
    const el: HTMLElement = fixture.nativeElement;
    const h1s = el.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
  });

  // Primary navigation now lives in the Forge shell rail (see sf-app-shell
  // specs); Home itself is a heading-structured set of cards.
  it('gives every Home card an <h2> under the single <h1>', () => {
    const el: HTMLElement = fixture.nativeElement;
    const cards = Array.from(el.querySelectorAll('.sf-card'));
    expect(cards.length).toBe(6);
    for (const card of cards) {
      expect(card.querySelector('h2')).not.toBeNull();
    }
  });

  it('exposes course progress as a labelled progressbar', () => {
    const el: HTMLElement = fixture.nativeElement;
    const ring = el.querySelector('[role="progressbar"]') as HTMLElement;
    expect(ring.getAttribute('aria-label')).toBe('AI Cyber Defender progress');
    expect(ring.getAttribute('aria-valuetext')).toContain('% complete');
  });

  it('keeps interactive controls keyboard-reachable (links/buttons, no click-only divs)', () => {
    const el: HTMLElement = fixture.nativeElement;
    const clickable = el.querySelectorAll('[click], div[role="button"], span[role="button"]');
    expect(clickable.length).toBe(0);
    expect(el.querySelectorAll('a[href], button').length).toBeGreaterThanOrEqual(4);
  });
});
