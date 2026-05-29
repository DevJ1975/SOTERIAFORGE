import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, TenantService } from '@forge/auth';
import { LeaderboardRepository } from '@forge/data-access';
import { LeaderboardPageComponent } from './leaderboard.component';
import type { Leaderboard } from '@forge/shared';

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

const mockLeaderboard: Leaderboard = {
  tenantId: 'tenant-1',
  period: 'allTime',
  entries: [
    { uid: 'u1', xp: 500, rank: 1, displayName: 'Alice' },
    { uid: 'u2', xp: 200, rank: 2, displayName: 'Bob' },
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockLeaderboardRepository = {
  get: jest.fn().mockResolvedValue(mockLeaderboard),
  watch: jest.fn(),
};

const mockTenantService = {
  tenantId: () => 'tenant-1',
};

describe('LeaderboardPageComponent', () => {
  let fixture: ComponentFixture<LeaderboardPageComponent>;

  beforeEach(async () => {
    jest.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [LeaderboardPageComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: TenantService, useValue: mockTenantService },
        { provide: LeaderboardRepository, useValue: mockLeaderboardRepository },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeaderboardPageComponent);
  });

  it('creates the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the back navigation link', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Back to Dashboard');
  });

  it('renders leaderboard entries after loading', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('500 XP');
  });
});
