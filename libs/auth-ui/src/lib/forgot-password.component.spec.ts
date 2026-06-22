import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AuthService } from '@assurance/auth';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ForgotPasswordComponent } from './forgot-password.component';

expect.extend(toHaveNoViolations);

const en = {
  auth: {
    email: 'Email',
    resetPassword: 'Reset password',
    sendResetLink: 'Send reset link',
    resetHint: 'Enter your account email and we will send you a link.',
    checkEmail: 'If an account exists for that email, a password reset link is on its way.',
    backToSignIn: 'Back to sign in',
    errors: {
      invalidEmail: 'Please enter a valid email address.',
      generic: 'Something went wrong.',
    },
  },
};

const transloco = () =>
  TranslocoTestingModule.forRoot({
    langs: { en },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });

type Cmp = { email: string; submit: () => Promise<void>; sent: () => boolean };

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  const auth = { sendPasswordResetEmail: jest.fn() };

  beforeEach(async () => {
    auth.sendPasswordResetEmail.mockReset();
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent, transloco()],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    fixture.detectChanges();
  });

  it('has no accessibility violations', async () => {
    expect(await axe(fixture.nativeElement)).toHaveNoViolations();
  });

  it('sends the reset email and shows the confirmation', async () => {
    auth.sendPasswordResetEmail.mockResolvedValue(undefined);
    const cmp = fixture.componentInstance as unknown as Cmp;
    cmp.email = 'a@b.com';
    await cmp.submit();
    fixture.detectChanges();
    expect(auth.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com');
    expect(cmp.sent()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'reset link is on its way',
    );
  });

  it('treats an unknown account as success (no user enumeration)', async () => {
    auth.sendPasswordResetEmail.mockRejectedValue({ code: 'auth/user-not-found' });
    const cmp = fixture.componentInstance as unknown as Cmp;
    cmp.email = 'nobody@b.com';
    await cmp.submit();
    expect(cmp.sent()).toBe(true);
  });
});
