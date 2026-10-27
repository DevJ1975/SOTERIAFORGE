import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GamificationApi, type ApiCrewBoard, type ApiScoreCard } from '@assurance/lms-core';
import { ProgressComponent } from './progress.component';

const card: ApiScoreCard = {
  totalXp: 340,
  todayXp: 20,
  level: 2,
  xpIntoLevel: 60,
  xpToNext: 120,
  streakDays: 3,
  strip: [...Array(11).fill(false), true, true, true],
  crew: null,
};

const board = (
  period: ApiCrewBoard['period'],
  crews: ApiCrewBoard['crews'] = [],
): ApiCrewBoard => ({
  period,
  scoring: 'Average XP per crew member',
  cohort: null,
  crews,
});

describe('ProgressComponent', () => {
  let fixture: ComponentFixture<ProgressComponent>;
  const progress = jest.fn();
  const crewBoard = jest.fn();
  const el = () => fixture.nativeElement as HTMLElement;

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(ProgressComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    progress.mockReset().mockResolvedValue(card);
    crewBoard.mockReset().mockImplementation(async (p) => board(p));
    TestBed.configureTestingModule({
      imports: [ProgressComponent],
      providers: [{ provide: GamificationApi, useValue: { progress, crewBoard } }],
    });
  });

  it('shows level, XP bar and streak from the server score card', async () => {
    await create();
    expect(el().textContent).toContain('Level 2');
    expect(el().textContent).toContain('60 / 120 XP to level 3');
    expect(el().querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(el().querySelector('.pg__num')?.textContent).toBe('3');
  });

  it('lists crews only, marks the learner’s crew and never names individuals', async () => {
    crewBoard.mockResolvedValue(
      board('weekly', [
        {
          rank: 1,
          crewId: 'a',
          name: 'Crew Alpha',
          score: 3140,
          totalXp: 15700,
          memberCount: 5,
          mine: true,
        },
        {
          rank: 2,
          crewId: 'b',
          name: 'Crew Bravo',
          score: 3010,
          totalXp: 15050,
          memberCount: 5,
          mine: false,
        },
      ]),
    );
    await create();
    const rows = el().querySelectorAll('.sf-lb-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('is-mine')).toBe(true);
    expect(rows[0].textContent).toContain('Your crew');
    expect(rows[0].textContent).toContain('3,140 XP');
    expect(el().textContent).toContain('Crews only');
  });

  it('explains an empty board and refetches when the period changes', async () => {
    await create();
    expect(el().textContent).toContain('not on a crew yet');
    const tab = Array.from(el().querySelectorAll('button')).find((b) =>
      b.textContent?.includes('All time'),
    );
    tab?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(crewBoard).toHaveBeenLastCalledWith('allTime');
    expect(tab?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows an alert, not a broken page, when the API is down', async () => {
    const offline = async () => {
      throw new Error('offline');
    };
    progress.mockImplementation(offline);
    crewBoard.mockImplementation(offline);
    await create();
    expect(el().querySelectorAll('[role="alert"]')).toHaveLength(2);
  });
});
