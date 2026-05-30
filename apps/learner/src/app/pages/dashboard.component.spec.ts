import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, AuthService, TenantService } from '@forge/auth';
import { MemberRepository } from '@forge/data-access';
import { DashboardComponent } from './dashboard.component';
import type { Member } from '@forge/shared';

const testEnv: ForgeEnvironment = {
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

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: mockAuthService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: MemberRepository, useValue: mockMemberRepository },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
  });

  it('creates the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the welcome message', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Welcome');
  });

  it('shows the leaderboard link', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[routerLink="/leaderboard"]')).not.toBeNull();
  });

  it('renders the xp-badge after member is loaded', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('forge-xp-badge')).not.toBeNull();
  });

  it('loads member from MemberRepository on init', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockMemberRepository.getById).toHaveBeenCalledWith('tenant-1', 'user-1');
  });
});
