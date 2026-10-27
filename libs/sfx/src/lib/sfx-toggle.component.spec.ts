import { TestBed } from '@angular/core/testing';
import { SfxToggleComponent } from './sfx-toggle.component';
import { SfxService } from './sfx.service';

describe('SfxToggleComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as never;
  });

  it('reflects and flips the mute state', () => {
    const fixture = TestBed.createComponent(SfxToggleComponent);
    const sfx = TestBed.inject(SfxService);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    button.click();
    fixture.detectChanges();
    expect(sfx.muted()).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
