import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { FORGE_ENV, type ForgeEnvironment, AuthService } from '@forge/auth';
import { CheckoutService } from '@forge/payments';
import { B2cCustomerRepository } from '@forge/data-access';
import { AccountComponent } from './account.component';

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

describe('AccountComponent', () => {
  let billingPortalSpy: jest.Mock;

  beforeEach(async () => {
    billingPortalSpy = jest.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        // Force browser platform so guards work; stubs prevent real Firebase calls.
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: AuthService,
          useValue: {
            principal: () => null,
            isAuthenticated: () => false,
            claims: () => null,
          },
        },
        {
          provide: B2cCustomerRepository,
          useValue: {
            getById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: CheckoutService,
          useValue: {
            openBillingPortal: billingPortalSpy,
            lastError: () => null,
          },
        },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the account heading', () => {
    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('My Learning');
  });

  it('calls openBillingPortal when openBillingPortal() is invoked', () => {
    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { openBillingPortal(): void }).openBillingPortal();
    expect(billingPortalSpy).toHaveBeenCalled();
  });
});
