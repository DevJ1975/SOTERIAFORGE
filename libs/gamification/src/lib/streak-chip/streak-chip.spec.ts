import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StreakChip } from './streak-chip';

describe('StreakChip', () => {
  let fixture: ComponentFixture<StreakChip>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StreakChip] }).compileComponents();
    fixture = TestBed.createComponent(StreakChip);
  });

  function render(days: number): HTMLElement {
    fixture.componentRef.setInput('streakDays', days);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the day count and a flame when active', () => {
    const el = render(7);
    expect(el.querySelector('.count')?.textContent).toContain('7');
    expect(el.querySelector('.flame')?.textContent).toContain('🔥');
    expect(el.querySelector('.chip')?.classList).not.toContain('cold');
    expect(el.querySelector('.chip')?.getAttribute('aria-label')).toBe('7-day streak');
  });

  it('uses the singular unit for a one-day streak', () => {
    const el = render(1);
    expect(el.querySelector('.unit')?.textContent).toContain('day');
    expect(el.querySelector('.unit')?.textContent).not.toContain('days');
  });

  it('goes cold for a zero or negative streak', () => {
    const el = render(0);
    expect(el.querySelector('.chip')?.classList).toContain('cold');
    expect(el.querySelector('.chip')?.getAttribute('aria-label')).toBe('No active streak');
    expect(render(-3).querySelector('.count')?.textContent).toContain('0');
  });
});
