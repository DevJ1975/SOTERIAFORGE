import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { GamificationData } from '@forge/gamification';
import { LeaderboardPage } from './leaderboard.page';

// Without an Auth provider the PrincipalStore settles 'signedOut', so the
// page renders its no-tenant state and never opens a Firestore subscription.
describe('LeaderboardPage', () => {
  let leaderboard: jest.Mock;

  beforeEach(async () => {
    leaderboard = jest.fn();
    await TestBed.configureTestingModule({
      imports: [LeaderboardPage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: Firestore, useValue: {} },
        { provide: GamificationData, useValue: { leaderboard } },
      ],
    }).compileComponents();
  });

  it('creates and renders the page heading', () => {
    const fixture = TestBed.createComponent(LeaderboardPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Leaderboard');
  });

  it('does not subscribe to the leaderboard while signed out', () => {
    const fixture = TestBed.createComponent(LeaderboardPage);
    fixture.detectChanges();
    expect(leaderboard).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No team workspace');
  });
});
