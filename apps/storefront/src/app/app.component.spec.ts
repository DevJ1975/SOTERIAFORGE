import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment, AuthService } from '@assurance/auth';
import { AppComponent } from './app.component';

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

describe('Storefront AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            principal: () => null,
            signOutUser: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
  });

  it('creates and renders the brand + nav', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Soteria Assurance');
    expect(text).toContain('Catalog');
  });

  it('shows Sign in link when not authenticated', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sign in');
  });
});
