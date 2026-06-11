import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { ForgeBadgeWall } from './badge-wall';
import { flameTone, ForgeStreakFlame } from './streak-flame';
import { ForgeLeaderboard } from './leaderboard';
import { ForgeXpRing } from './xp-ring';
import { GamificationData } from './gamification-data.service';

describe('flameTone', () => {
  it('maps streak length to the brand tones', () => {
    expect(flameTone(0)).toBe('cold');
    expect(flameTone(1)).toBe('warm');
    expect(flameTone(2)).toBe('warm');
    expect(flameTone(3)).toBe('spark');
    expect(flameTone(6)).toBe('spark');
    expect(flameTone(7)).toBe('ember');
    expect(flameTone(30)).toBe('ember');
    expect(flameTone(Number.NaN)).toBe('cold');
  });
});

describe('GamificationData', () => {
  it('constructs against a stubbed Firestore', () => {
    TestBed.configureTestingModule({ providers: [{ provide: Firestore, useValue: {} }] });
    expect(TestBed.inject(GamificationData)).toBeTruthy();
  });
});

@Component({
  imports: [ForgeXpRing, ForgeStreakFlame, ForgeBadgeWall, ForgeLeaderboard],
  template: `
    <forge-xp-ring [xp]="350" />
    <forge-streak-flame [days]="8" />
    <forge-badge-wall [awards]="awards" (verify)="verified.push($event)" />
    <forge-leaderboard [entries]="entries" [currentUid]="'u2'" [period]="'weekly'" />
  `,
})
class HostComponent {
  awards = [
    {
      badgeId: 'first-steps',
      name: 'First Steps',
      description: 'Complete your first course',
      earnedAt: '2026-06-01T12:00:00.000Z',
    },
  ];
  entries = [
    { uid: 'u1', displayName: 'Ada', xp: 900, rank: 1 },
    { uid: 'u2', displayName: 'Grace', xp: 700, rank: 2 },
  ];
  verified: string[] = [];
}

describe('gamification components', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  it('renders the XP ring with the level from the curve (350 xp → L3)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const ring = (fixture.nativeElement as HTMLElement).querySelector('forge-xp-ring');
    expect(ring?.textContent).toContain('3');
    expect(ring?.textContent).toContain('50 / 300 XP');
  });

  it('renders the streak flame with the ember tone at 8 days', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const flame = (fixture.nativeElement as HTMLElement).querySelector('forge-streak-flame .flame');
    expect(flame?.classList).toContain('ember');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('forge-streak-flame')?.textContent,
    ).toContain('8');
  });

  it('renders earned + locked badge tiles and emits verify with the badge id', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const wall = (fixture.nativeElement as HTMLElement).querySelector('forge-badge-wall');
    expect(wall?.querySelectorAll('.tile')).toHaveLength(6);
    expect(wall?.querySelectorAll('.tile.earned')).toHaveLength(1);
    expect(wall?.querySelectorAll('.tile.locked')).toHaveLength(5);
    (wall?.querySelector('.verify') as HTMLButtonElement).click();
    expect(fixture.componentInstance.verified).toEqual(['first-steps']);
  });

  it('highlights the signed-in user and tints the podium on the leaderboard', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const board = (fixture.nativeElement as HTMLElement).querySelector('forge-leaderboard');
    const rows = board?.querySelectorAll('li.row');
    expect(rows).toHaveLength(2);
    expect(rows?.[0].classList).toContain('gold');
    expect(rows?.[1].classList).toContain('silver');
    expect(rows?.[1].classList).toContain('me');
    expect(board?.textContent).toContain('Grace');
    expect(board?.textContent).toContain('700 XP');
  });

  it('shows the empty state when the board has no entries', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.entries = [];
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('forge-leaderboard')?.textContent,
    ).toContain('No rankings yet — complete a lesson to get on the board.');
  });
});
