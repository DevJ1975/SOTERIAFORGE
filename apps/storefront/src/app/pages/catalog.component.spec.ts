import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { FORGE_ENV, type ForgeEnvironment } from '@assurance/auth';
import { CheckoutService } from '@assurance/payments';
import { CatalogRepository } from '@assurance/data-access';
import { CatalogComponent } from './catalog.component';

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

describe('CatalogComponent', () => {
  let checkoutSpy: jest.Mock;

  beforeEach(async () => {
    checkoutSpy = jest.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [
        provideRouter([]),
        { provide: FORGE_ENV, useValue: testEnv },
        // Force browser platform so guards work; stubs prevent real Firebase calls.
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: CatalogRepository,
          useValue: {
            listPublished: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CheckoutService,
          useValue: {
            startCheckout: checkoutSpy,
            lastError: () => null,
          },
        },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the catalog heading', () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Course Catalog');
  });

  it('calls startCheckout when buy() is invoked', () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    // Call the protected method directly to verify the integration.
    (fixture.componentInstance as unknown as { buy(id: string): void }).buy('test-product-id');
    expect(checkoutSpy).toHaveBeenCalledWith('test-product-id');
  });
});
