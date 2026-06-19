import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Badge } from '@forge/shared';
import { BadgeWall } from './badge-wall';

function makeBadge(id: string, name: string, extra: Partial<Badge> = {}): Badge {
  return {
    id,
    tenantId: 'atl-airport',
    name,
    description: '',
    criteria: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as Badge;
}

describe('BadgeWall', () => {
  let fixture: ComponentFixture<BadgeWall>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BadgeWall] }).compileComponents();
    fixture = TestBed.createComponent(BadgeWall);
  });

  function render(badges: Badge[], earnedIds: string[] = []): HTMLElement {
    fixture.componentRef.setInput('badges', badges);
    fixture.componentRef.setInput('earnedIds', earnedIds);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders an empty state when there are no badges', () => {
    const el = render([]);
    expect(el.querySelector('.empty')).toBeTruthy();
    expect(el.querySelector('.grid')).toBeNull();
  });

  it('marks earned badges and dims locked ones', () => {
    const el = render([makeBadge('a', 'Ramp Rookie'), makeBadge('b', 'Safety Star')], ['a']);
    const items = el.querySelectorAll('.badge');
    expect(items.length).toBe(2);
    expect(items[0].classList).toContain('earned');
    expect(items[1].classList).toContain('locked');
    // Locked badge shows the lock affordance; earned does not.
    expect(items[1].querySelector('.lock')).toBeTruthy();
    expect(items[0].querySelector('.lock')).toBeNull();
  });

  it('summarizes the earned count', () => {
    const el = render([makeBadge('a', 'A'), makeBadge('b', 'B'), makeBadge('c', 'C')], ['a', 'c']);
    expect(el.querySelector('.wall-count')?.textContent).toContain('2 / 3');
  });

  it('falls back to a monogram when a badge has no image', () => {
    const el = render([makeBadge('a', 'Ramp Rookie')], ['a']);
    expect(el.querySelector('.monogram')?.textContent?.trim()).toBe('RR');
  });

  it('uses the image when provided', () => {
    const el = render([makeBadge('a', 'Pic', { imageUrl: 'https://example.com/b.png' })], ['a']);
    expect(el.querySelector('.medallion img')).toBeTruthy();
  });
});
