import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FORGE_ENV, type ForgeEnvironment, AuthService } from '@forge/auth';
import { StorefrontAuthComponent } from './auth.component';

const testEnv: ForgeEnvironment = {
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

const makeAuthStub = () => ({
  signInWithPassword: jest.fn().mockResolvedValue(undefined),
  signUp: jest.fn().mockResolvedValue(undefined),
  isAuthenticated: () => false,
  principal: () => null,
});

describe('StorefrontAuthComponent', () => {
  let authStub: ReturnType<typeof makeAuthStub>;

  beforeEach(async () => {
    authStub = makeAuthStub();

    await TestBed.configureTestingModule({
      imports: [StorefrontAuthComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(StorefrontAuthComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders sign-in heading by default', () => {
    const fixture = TestBed.createComponent(StorefrontAuthComponent);
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Sign in');
  });

  it('calls signInWithPassword on submit in sign-in mode', async () => {
    const fixture = TestBed.createComponent(StorefrontAuthComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      email: string;
      password: string;
      submit(): Promise<void>;
    };
    component.email = 'user@example.com';
    component.password = 'secret123';

    await component.submit();

    expect(authStub.signInWithPassword).toHaveBeenCalledWith('user@example.com', 'secret123');
    expect(authStub.signUp).not.toHaveBeenCalled();
  });

  it('calls signUp on submit in sign-up mode', async () => {
    const fixture = TestBed.createComponent(StorefrontAuthComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      email: string;
      password: string;
      displayName: string;
      toggleMode(): void;
      submit(): Promise<void>;
    };
    component.toggleMode(); // switch to sign-up
    component.email = 'new@example.com';
    component.password = 'newpass456';
    component.displayName = 'Alice';

    await component.submit();

    expect(authStub.signUp).toHaveBeenCalledWith('new@example.com', 'newpass456', 'Alice');
    expect(authStub.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows sign-up fields after toggling mode', () => {
    const fixture = TestBed.createComponent(StorefrontAuthComponent);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { toggleMode(): void }).toggleMode();
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Create account');
    expect(text).toContain('Display name');
  });
});
