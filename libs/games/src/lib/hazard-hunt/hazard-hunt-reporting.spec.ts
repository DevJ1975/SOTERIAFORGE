/**
 * Hazard Hunter — game-result reporting + XP chip tests.
 *
 * The three.js world, Phaser HUD and WebAudio engine are module-mocked so the
 * component can run under jsdom; everything else (ShiftEngine, signals,
 * templates) is real. Reporting is driven through the public surface:
 * start → endShiftEarly → click through incident reports → scorecard.
 */
import { TestBed } from '@angular/core/testing';
import { GAME_RESULT_SINK, GameResultReport, GameResultSink } from '../game-result';
import { getLevel } from './hazard-data';
import { HazardHuntComponent } from './hazard-hunt.component';
import { HAZARD_HUNTER_XP_CAP, hazardHunterXp } from './xp';

jest.mock('./world', () => ({
  HazardWorld: jest.fn().mockImplementation(() => ({
    loadLevel: jest.fn(),
    setActive: jest.fn(),
    requestLock: jest.fn(),
    exitLock: jest.fn(),
    markFound: jest.fn(),
    dispose: jest.fn(),
  })),
}));

jest.mock('./hud', () => ({
  HazardHud: jest.fn().mockImplementation(() => ({
    setScore: jest.fn(),
    setFound: jest.fn(),
    setInspections: jest.fn(),
    showBanner: jest.fn(),
    popup: jest.fn(),
    incidentPulse: jest.fn(),
    confetti: jest.fn(),
    destroy: jest.fn(),
  })),
}));

jest.mock('./audio', () => ({
  SfxEngine: jest.fn().mockImplementation(() => ({
    resume: jest.fn(),
    click: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    alarm: jest.fn(),
    fanfare: jest.fn(),
    setMuted: jest.fn(),
    dispose: jest.fn(),
  })),
}));

const FOUND_POINTS = 250;
const MISS_PENALTY = 150;
const UNUSED_BONUS = 100;

const level1 = getLevel(1);
if (!level1) throw new Error('level 1 missing');

/** Shift 1 ended immediately: nothing found, all inspections unused. */
const expectedScore = Math.max(
  0,
  level1.inspections * UNUSED_BONUS - level1.hazards.length * MISS_PENALTY,
);
const expectedMaxScore =
  level1.hazards.length * FOUND_POINTS +
  (level1.inspections - level1.hazards.length) * UNUSED_BONUS;

async function setup(sink: GameResultSink | null) {
  await TestBed.configureTestingModule({
    imports: [HazardHuntComponent],
    providers: sink ? [{ provide: GAME_RESULT_SINK, useValue: sink }] : [],
  }).compileComponents();
  const fixture = TestBed.createComponent(HazardHuntComponent);
  fixture.detectChanges(); // ngAfterViewInit → mocked world/hud/sfx
  return fixture;
}

/** Plays a full (failed) shift: clock in, end early, read every incident. */
function completeShift(component: HazardHuntComponent): void {
  component.start(1);
  component.endShiftEarly();
  let guard = 0;
  while (component.phase() === 'incidents' && guard++ < 100) {
    component.nextIncident();
  }
  expect(component.phase()).toBe('scorecard');
}

function text(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent ?? '';
}

describe('HazardHuntComponent result reporting', () => {
  it('reports exactly once per completed shift with the backend payload', async () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const fixture = await setup({ report });

    completeShift(fixture.componentInstance);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      game: 'hazard-hunter',
      score: expectedScore,
      maxScore: expectedMaxScore,
    } satisfies GameResultReport);
  });

  it('reports a failed shift too — score is still earned', async () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const fixture = await setup({ report });

    completeShift(fixture.componentInstance);

    // Nothing found → grade F, yet the result still went to the sink.
    expect(fixture.componentInstance.summary()?.grade).toBe('F');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reports again (once each) when the player retries the shift', async () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const fixture = await setup({ report });

    completeShift(fixture.componentInstance);
    completeShift(fixture.componentInstance); // retry = new shift
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('shows the ember XP chip with the syncing shimmer while the write is in flight', async () => {
    let resolveReport!: () => void;
    const report = jest.fn(() => new Promise<void>((resolve) => (resolveReport = resolve)));
    const fixture = await setup({ report });

    completeShift(fixture.componentInstance);
    fixture.detectChanges();

    expect(fixture.componentInstance.xpSync()).toBe('syncing');
    expect(text(fixture)).toContain(`+${hazardHunterXp(expectedScore)} XP`);
    expect(text(fixture)).toContain('syncing to your profile…');

    resolveReport();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.xpSync()).toBe('recorded');
    expect(text(fixture)).toContain('Recorded — see your Profile');
    expect(text(fixture)).not.toContain('syncing to your profile…');
  });

  it('shows the sign-in copy when the sink rejects with unauthenticated', async () => {
    const report = jest.fn().mockRejectedValue(new Error('unauthenticated'));
    const fixture = await setup({ report });

    completeShift(fixture.componentInstance);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.xpSync()).toBe('signed-out');
    expect(text(fixture)).toContain('Sign in to earn XP from the Arcade');
    expect(fixture.nativeElement.querySelector('.hh-xp-chip')).toBeNull();
  });

  it('shows the sign-in copy when no sink is provided at all', async () => {
    const fixture = await setup(null);

    completeShift(fixture.componentInstance);
    fixture.detectChanges();

    expect(fixture.componentInstance.xpSync()).toBe('signed-out');
    expect(text(fixture)).toContain('Sign in to earn XP from the Arcade');
  });

  it('shows a quiet error note for any other sink failure', async () => {
    const report = jest.fn().mockRejectedValue(new Error('permission-denied'));
    const fixture = await setup({ report });

    completeShift(fixture.componentInstance);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.xpSync()).toBe('error');
    expect(text(fixture)).toContain('Could not record this run');
  });
});

describe('hazardHunterXp — backend formula mirror (min(150, round(score / 10)))', () => {
  it.each([
    [0, 0],
    [4, 0], // rounds down
    [5, 1], // rounds up at .5
    [10, 1],
    [870, 87],
    [994, 99],
    [995, 100],
    [1494, 149],
    [1495, 150], // rounds into the cap
    [1500, 150], // exactly at the cap
    [2000, 150], // capped
    [99999, 150], // capped
  ])('score %i → %i XP', (score, xp) => {
    expect(hazardHunterXp(score)).toBe(xp);
  });

  it('caps at the documented constant', () => {
    expect(HAZARD_HUNTER_XP_CAP).toBe(150);
  });
});
