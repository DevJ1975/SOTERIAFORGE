import { ComponentFixture, TestBed } from '@angular/core/testing';
import { XpBar } from './xp-bar';

describe('XpBar', () => {
  let fixture: ComponentFixture<XpBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [XpBar] }).compileComponents();
    fixture = TestBed.createComponent(XpBar);
  });

  function render(xp: number): HTMLElement {
    fixture.componentRef.setInput('xp', xp);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the current level and progress to the next', () => {
    const el = render(450); // level 3, halfway through [300, 600)
    expect(el.querySelector('.level-num')?.textContent).toContain('3');
    const bar = el.querySelector('.track');
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
    expect(el.querySelector('.next')?.textContent).toContain('to level 4');
  });

  it('renders the xp total formatted with separators', () => {
    const el = render(1500);
    expect(el.querySelector('.xp-total')?.textContent).toContain('1,500');
  });

  it('exposes a progressbar role with aria bounds', () => {
    const el = render(50);
    const bar = el.querySelector('.track');
    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
  });

  it('handles the level 1 floor without errors', () => {
    const el = render(0);
    expect(el.querySelector('.level-num')?.textContent).toContain('1');
    expect(el.querySelector('.track')?.getAttribute('aria-valuenow')).toBe('0');
  });
});
