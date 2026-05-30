// Mock @assurance/data-access to avoid pulling in Firebase in unit tests.
jest.mock('@assurance/data-access', () => ({
  LeaderboardRepository: class LeaderboardRepository {
    get = jest.fn();
    watch = jest.fn();
  },
}));

import { TestBed, ComponentFixture } from '@angular/core/testing';
import { LeaderboardRepository } from '@assurance/data-access';
import { LeaderboardComponent } from './leaderboard.component';
import type { Leaderboard } from '@assurance/shared';

const mockLeaderboard: Leaderboard = {
  tenantId: 'acme',
  period: 'allTime',
  entries: [
    { uid: 'u1', xp: 500, rank: 1, displayName: 'Alice' },
    { uid: 'u2', xp: 300, rank: 2, displayName: 'Bob' },
    { uid: 'u3', xp: 300, rank: 2, displayName: 'Carol' },
    { uid: 'u4', xp: 100, rank: 4 },
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('LeaderboardComponent', () => {
  let fixture: ComponentFixture<LeaderboardComponent>;
  let mockRepo: LeaderboardRepository;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeaderboardComponent],
      providers: [LeaderboardRepository],
    }).compileComponents();

    mockRepo = TestBed.inject(LeaderboardRepository);
    (mockRepo.get as jest.Mock).mockResolvedValue(mockLeaderboard);

    fixture = TestBed.createComponent(LeaderboardComponent);
    fixture.componentRef.setInput('tenantId', 'acme');
  });

  it('creates the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows loading initially', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toBeTruthy();
  });

  it('renders ranked entries after loading', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).toContain('500 XP');
  });

  it('renders rank numbers', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const ranks = el.querySelectorAll('.leaderboard__rank');
    expect(ranks.length).toBe(4);
    expect(ranks[0].textContent?.trim()).toBe('1');
  });

  it('shows "No entries yet" when leaderboard is empty', async () => {
    (mockRepo.get as jest.Mock).mockResolvedValueOnce(null);

    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No entries yet');
  });

  it('uses default period allTime', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.period()).toBe('allTime');
  });

  it('shows uid when displayName is absent', async () => {
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    // Entry for u4 has no displayName — should show uid
    expect(el.textContent).toContain('u4');
  });
});
