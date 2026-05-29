import { TestBed, ComponentFixture } from '@angular/core/testing';
import { XpBadgeComponent } from './xp-badge.component';

describe('XpBadgeComponent', () => {
  let fixture: ComponentFixture<XpBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [XpBadgeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(XpBadgeComponent);
  });

  it('creates the component', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows level 1 at 0 XP', () => {
    fixture.componentRef.setInput('xp', 0);
    fixture.componentRef.setInput('streakDays', 0);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.xp-badge__level-value')?.textContent?.trim()).toBe('1');
  });

  it('shows level 2 when XP crosses the threshold (283 XP)', () => {
    fixture.componentRef.setInput('xp', 283);
    fixture.componentRef.setInput('streakDays', 0);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.xp-badge__level-value')?.textContent?.trim()).toBe('2');
  });

  it('shows streak when streakDays > 0', () => {
    fixture.componentRef.setInput('xp', 100);
    fixture.componentRef.setInput('streakDays', 5);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.xp-badge__streak')).not.toBeNull();
    expect(el.querySelector('.xp-badge__streak-value')?.textContent?.trim()).toBe('5');
  });

  it('hides streak when streakDays is 0', () => {
    fixture.componentRef.setInput('xp', 100);
    fixture.componentRef.setInput('streakDays', 0);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.xp-badge__streak')).toBeNull();
  });

  it('renders xp progress label', () => {
    fixture.componentRef.setInput('xp', 150);
    fixture.componentRef.setInput('streakDays', 0);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const label = el.querySelector('.xp-badge__progress-label')?.textContent ?? '';
    expect(label).toContain('XP');
  });
});
