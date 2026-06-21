import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { CheckoutService } from '@assurance/payments';
import { CatalogRepository } from '@assurance/data-access';
import { CatalogComponent } from './catalog.component';

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

describe('CatalogComponent', () => {
  let checkoutSpy: jest.Mock;

  beforeEach(async () => {
    checkoutSpy = jest.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
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

// MO-15: the gated SSR-dynamic-catalog mechanism. On the server, the product
// list is fetched only when a real Firebase config is present; with an empty
// apiKey the prerender must NOT attempt a Firestore read.
describe('CatalogComponent SSR gating', () => {
  const serverEnv = (apiKey: string): AssuranceEnvironment => ({
    production: true,
    rootDomain: 'soteriaforge.com',
    firebase: {
      apiKey,
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
    },
  });

  async function setup(apiKey: string, listPublished: jest.Mock) {
    await TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: serverEnv(apiKey) },
        // Force SERVER platform to exercise the SSR branch.
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: CatalogRepository, useValue: { listPublished } },
        { provide: CheckoutService, useValue: { startCheckout: jest.fn(), lastError: () => null } },
      ],
    }).compileComponents();
    return TestBed.createComponent(CatalogComponent);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('does NOT read Firestore during SSR when apiKey is empty', async () => {
    const listPublished = jest.fn().mockResolvedValue([]);
    const fixture = await setup('', listPublished);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    expect(listPublished).not.toHaveBeenCalled();
  });

  it('fetches the product list during SSR when a Firebase config is present', async () => {
    const listPublished = jest.fn().mockResolvedValue([
      {
        id: 'p1',
        title: 'SSR Course',
        description: 'Rendered on the server',
        mode: 'payment',
      },
    ]);
    const fixture = await setup('real-key', listPublished);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(listPublished).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('SSR Course');
  });
});
