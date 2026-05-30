import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ASSURANCE_ENV, type AssuranceEnvironment } from '@assurance/auth';
import { CatalogRepository } from '@assurance/data-access';
import type { CatalogProduct } from '@assurance/shared';
import { CatalogComponent } from './catalog.component';

// Polyfill crypto.randomUUID for jsdom
if (!('randomUUID' in crypto)) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }),
    configurable: true,
  });
}

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

const mockProduct: CatalogProduct = {
  id: 'prod-1',
  title: 'Test Course',
  description: 'A test course description',
  stripePriceId: 'price_test123',
  mode: 'payment',
  grants: { kind: 'course', refId: 'course-abc' },
  published: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const catalogRepoStub = {
  listAll: jest.fn(async (): Promise<CatalogProduct[]> => []),
  set: jest.fn(async (_id: string, _value: CatalogProduct): Promise<void> => undefined),
};

describe('CatalogComponent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CatalogComponent],
      providers: [
        provideRouter([]),
        { provide: ASSURANCE_ENV, useValue: testEnv },
        { provide: CatalogRepository, useValue: catalogRepoStub },
      ],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calls CatalogRepository.listAll on init', async () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(catalogRepoStub.listAll).toHaveBeenCalledTimes(1);
  });

  it('renders loaded products in the table', async () => {
    catalogRepoStub.listAll.mockResolvedValueOnce([mockProduct]);
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Test Course');
  });

  it('calls CatalogRepository.set with a new product on create', async () => {
    const fixture = TestBed.createComponent(CatalogComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const comp = fixture.componentInstance as unknown as {
      newTitle: string;
      newDescription: string;
      newStripePriceId: string;
      newMode: string;
      newGrantsKind: string;
      newGrantsRefId: string;
      newPublished: boolean;
      create(): Promise<void>;
    };

    comp.newTitle = 'New Product';
    comp.newDescription = 'desc';
    comp.newStripePriceId = 'price_new';
    comp.newMode = 'payment';
    comp.newGrantsKind = 'course';
    comp.newGrantsRefId = '';
    comp.newPublished = false;

    await comp.create();

    expect(catalogRepoStub.set).toHaveBeenCalledTimes(1);
    const [calledId, calledProduct] = catalogRepoStub.set.mock.calls[0] as unknown as [
      string,
      CatalogProduct,
    ];
    expect(calledId).toBeTruthy();
    expect(calledProduct.title).toBe('New Product');
    expect(calledProduct.stripePriceId).toBe('price_new');
    expect(calledProduct.mode).toBe('payment');
    expect(calledProduct.grants.kind).toBe('course');
    expect(calledProduct.createdAt).toBeTruthy();
  });
});
