import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '@assurance/auth';
import { axe, toHaveNoViolations } from 'jest-axe';
import { LoginComponent } from './login.component';

expect.extend(toHaveNoViolations);

const en = {
  auth: {
    signIn: 'Sign in',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Forgot password?',
    errors: { invalidCredentials: 'Invalid email or password.', generic: 'Something went wrong.' },
  },
};

const transloco = () =>
  TranslocoTestingModule.forRoot({
    langs: { en },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  const auth = { signInWithPassword: jest.fn() };
  let returnUrl: string | null = null;

  beforeEach(async () => {
    auth.signInWithPassword.mockReset();
    returnUrl = null;
    await TestBed.configureTestingModule({
      imports: [LoginComponent, transloco()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => returnUrl } } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  it('has no accessibility violations', async () => {
    expect(await axe(fixture.nativeElement)).toHaveNoViolations();
  });

  it('associates both inputs with a label and exposes a single h1', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('label[for="login-email"]')).not.toBeNull();
    expect(el.querySelector('label[for="login-password"]')).not.toBeNull();
    expect(el.querySelector('[aria-live]')).not.toBeNull();
  });

  it('signs in and navigates to returnUrl (defaulting to /) on success', async () => {
    auth.signInWithPassword.mockResolvedValue(undefined);
    const nav = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as {
      email: string;
      password: string;
      submit: () => Promise<void>;
    };
    cmp.email = 'a@b.com';
    cmp.password = 'pw';
    await cmp.submit();
    expect(auth.signInWithPassword).toHaveBeenCalledWith('a@b.com', 'pw');
    expect(nav).toHaveBeenCalledWith('/');
  });

  it('honours the returnUrl query param', async () => {
    auth.signInWithPassword.mockResolvedValue(undefined);
    returnUrl = '/courses/42';
    const nav = jest.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const cmp = fixture.componentInstance as unknown as {
      email: string;
      password: string;
      submit: () => Promise<void>;
    };
    cmp.email = 'a@b.com';
    cmp.password = 'pw';
    await cmp.submit();
    expect(nav).toHaveBeenCalledWith('/courses/42');
  });

  it('renders a mapped, translated error on failure', async () => {
    auth.signInWithPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
    const cmp = fixture.componentInstance as unknown as {
      email: string;
      password: string;
      submit: () => Promise<void>;
    };
    cmp.email = 'a@b.com';
    cmp.password = 'pw';
    await cmp.submit();
    fixture.detectChanges();
    const err = (fixture.nativeElement as HTMLElement).querySelector('#login-error');
    expect(err?.textContent).toContain('Invalid email or password.');
  });
});
