import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule, type TranslocoTestingOptions } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from './language-switcher.component';

function testingModule(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: { en: {}, es: {} },
    translocoConfig: { availableLangs: ['en', 'es'], defaultLang: 'en' },
    preloadLangs: true,
    ...options,
  });
}

describe('LanguageSwitcherComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LanguageSwitcherComponent, testingModule()],
    }).compileComponents();
  });

  it('creates and lists the available languages', () => {
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('EN');
    expect(text).toContain('ES');
  });

  it('switches the active language', () => {
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'es';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(select.value).toBe('es');
  });
});
