import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ForgeLogin } from './login';

// Light creation test only: no Firebase providers are configured, so the
// PrincipalStore resolves Auth optionally (null) and the component must still
// construct and render. Flows that hit the real SDK are exercised against the
// emulators, not here.
describe('ForgeLogin', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgeLogin],
      providers: [provideRouter([]), provideNoopAnimations()],
    }).compileComponents();
  });

  it('creates and renders the brand login card', () => {
    const fixture = TestBed.createComponent(ForgeLogin);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Soteria');
    expect(el.textContent).toContain('Forge');
    expect(el.querySelector('input[name="email"]')).toBeTruthy();
    expect(el.querySelector('input[name="password"]')).toBeTruthy();
  });

  it('shows a validation error when submitted empty', async () => {
    const fixture = TestBed.createComponent(ForgeLogin);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Enter an email and password.',
    );
  });

  it('toggles between sign-in and create-account modes', () => {
    const fixture = TestBed.createComponent(ForgeLogin);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector<HTMLButtonElement>('button.toggle');
    expect(el.querySelector('h1')?.textContent).toContain('Sign in');

    toggle?.click();
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toContain('Create account');
  });
});
