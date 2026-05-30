import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment, AuthService } from '@assurance/auth';
import { axe, toHaveNoViolations } from 'jest-axe';
import { LoginComponent } from './login.component';

expect.extend(toHaveNoViolations);

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

const mockAuthService = {
  signInWithPassword: jest.fn().mockResolvedValue(undefined),
};

describe('LoginComponent – accessibility', () => {
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  it('has no axe violations', async () => {
    const results = await axe(fixture.nativeElement);
    expect(results).toHaveNoViolations();
  });

  it('has a single <h1>', () => {
    const el: HTMLElement = fixture.nativeElement;
    const h1s = el.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent?.trim()).toBe('Sign in');
  });

  it('associates each input with a <label> via for/id', () => {
    const el: HTMLElement = fixture.nativeElement;
    const emailInput = el.querySelector('#login-email') as HTMLInputElement | null;
    const passwordInput = el.querySelector('#login-password') as HTMLInputElement | null;
    expect(emailInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(el.querySelector('label[for="login-email"]')).not.toBeNull();
    expect(el.querySelector('label[for="login-password"]')).not.toBeNull();
  });

  it('marks inputs as aria-required', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#login-email')?.getAttribute('aria-required')).toBe('true');
    expect(el.querySelector('#login-password')?.getAttribute('aria-required')).toBe('true');
  });

  it('has an aria-live region for errors', () => {
    const el: HTMLElement = fixture.nativeElement;
    const liveRegion = el.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
  });
});
