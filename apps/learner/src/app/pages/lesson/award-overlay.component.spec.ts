import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ApiAward } from '@assurance/lms-core';
import { AwardOverlayComponent } from './award-overlay.component';

const award: ApiAward = {
  awarded: 30,
  totalXp: 130,
  level: 2,
  leveledUp: false,
  streakDays: 4,
  streakExtended: true,
};

describe('AwardOverlayComponent', () => {
  let fixture: ComponentFixture<AwardOverlayComponent>;
  const el = () => fixture.nativeElement as HTMLElement;

  async function create(value: ApiAward): Promise<void> {
    fixture = TestBed.createComponent(AwardOverlayComponent);
    fixture.componentRef.setInput('award', value);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [AwardOverlayComponent] }));

  it('is a labelled modal dialog that focuses Continue', async () => {
    await create(award);
    const dialog = el().querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(el().querySelector('#ao-title')?.textContent).toContain('+30 XP');
    expect(document.activeElement).toBe(el().querySelector('button'));
  });

  it('reports the streak in words and the level without celebrating a level-up', async () => {
    await create(award);
    expect(el().textContent).toContain('Streak: 4 days');
    expect(el().textContent).toContain('Lesson complete');
    expect(el().textContent).toContain('Level 2 · 130 XP in total');
  });

  it('announces a level-up', async () => {
    await create({ ...award, leveledUp: true, level: 3 });
    expect(el().textContent).toContain('Level up');
    expect(el().textContent).toContain('You reached level 3');
  });

  it('shows "Nice work" when only the streak moved', async () => {
    await create({ ...award, awarded: 0 });
    expect(el().querySelector('#ao-title')?.textContent).toContain('Nice work');
  });

  it('closes from Continue, the scrim and Escape, but not from inside the panel', async () => {
    await create(award);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    el().querySelector<HTMLElement>('[role="dialog"]')?.click();
    expect(closed).toBe(0);
    el().querySelector('button')?.click();
    el().querySelector<HTMLElement>('.ao')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(3);
  });
});
