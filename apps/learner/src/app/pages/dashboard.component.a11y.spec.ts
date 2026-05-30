import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  ASSURANCE_ENV,
  type AssuranceEnvironment,
  AuthService,
  TenantService,
} from '@assurance/auth';
import { MemberRepository } from '@assurance/data-access';
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

describe('DashboardComponent – accessibility', () => {
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: MemberRepository, useValue: mockMemberRepository },
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

  it('navigation uses <nav> with an aria-label', () => {
    const el: HTMLElement = fixture.nativeElement;
    const nav = el.querySelector('nav[aria-label]');
    expect(nav).not.toBeNull();
  });
});
