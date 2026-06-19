import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { LeaderboardEntry } from '@forge/shared';
import { LeaderboardTable } from './leaderboard-table';

function entry(uid: string, displayName: string, xp: number, rank: number): LeaderboardEntry {
  return { uid, displayName, xp, rank };
}

describe('LeaderboardTable', () => {
  let fixture: ComponentFixture<LeaderboardTable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LeaderboardTable] }).compileComponents();
    fixture = TestBed.createComponent(LeaderboardTable);
  });

  function render(entries: LeaderboardEntry[], currentUid?: string): HTMLElement {
    fixture.componentRef.setInput('entries', entries);
    if (currentUid !== undefined) fixture.componentRef.setInput('currentUid', currentUid);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders an empty state with no entries', () => {
    const el = render([]);
    expect(el.querySelector('.empty')).toBeTruthy();
    expect(el.querySelector('table')).toBeNull();
  });

  it('sorts by rank and gives the top three medals', () => {
    const el = render([
      entry('c', 'Carol', 300, 3),
      entry('a', 'Alice', 900, 1),
      entry('b', 'Bob', 600, 2),
    ]);
    const rows = el.querySelectorAll('tbody .row');
    expect(rows[0].querySelector('.name')?.textContent).toContain('Alice');
    expect(rows.length).toBe(3);
    const medals = el.querySelectorAll('.medal');
    expect(medals.length).toBe(3);
    expect(medals[0].textContent).toContain('🥇');
  });

  it('does not award a medal beyond rank 3', () => {
    const el = render([
      entry('a', 'Alice', 900, 1),
      entry('b', 'Bob', 600, 2),
      entry('c', 'Carol', 300, 3),
      entry('d', 'Dan', 100, 4),
    ]);
    const rows = el.querySelectorAll('tbody .row');
    expect(rows[3].querySelector('.medal')).toBeNull();
  });

  it('highlights the current user row', () => {
    const el = render([entry('a', 'Alice', 900, 1), entry('b', 'Bob', 600, 2)], 'b');
    const rows = el.querySelectorAll('tbody .row');
    expect(rows[0].classList).not.toContain('current');
    expect(rows[1].classList).toContain('current');
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    expect(rows[1].querySelector('.you')).toBeTruthy();
  });

  it('formats xp with separators', () => {
    const el = render([entry('a', 'Alice', 12500, 1)]);
    expect(el.querySelector('tbody .col-xp')?.textContent).toContain('12,500');
  });
});
