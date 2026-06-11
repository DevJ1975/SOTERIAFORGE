import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { ForgeCheckout, ForgeEntitlements } from '@forge/payments';
import type { CatalogProduct } from '@forge/shared';
import { CatalogPage } from './catalog.page';
import { StoreCatalog } from '../store-catalog.service';

function product(
  id: string,
  title: string,
  kind: CatalogProduct['grants']['kind'],
): CatalogProduct {
  return {
    id,
    title,
    description: `${title} description`,
    grants: { kind },
    stripePriceId: `price_${id}`,
    mode: 'payment',
    published: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('CatalogPage', () => {
  const products = [
    product('owned-1', 'Forklift Fundamentals', 'course'),
    product('p2', 'Lockout/Tagout Module', 'module'),
    product('p3', 'Everything Pass', 'all_access'),
  ];

  const listPublished = jest.fn();
  const checkoutFn = jest.fn();
  const checkoutState = signal<'idle' | 'redirecting' | 'error'>('idle');

  const checkoutStub = {
    state: checkoutState,
    errorMessage: signal<string | null>(null),
    checkout: checkoutFn,
  } as unknown as ForgeCheckout;

  const entitlementsStub = {
    status: signal<'loading' | 'ready'>('ready'),
    owns: (productId: string) => productId === 'owned-1',
  } as unknown as ForgeEntitlements;

  beforeEach(async () => {
    jest.clearAllMocks();
    checkoutState.set('idle');
    listPublished.mockResolvedValue(products);

    await TestBed.configureTestingModule({
      imports: [CatalogPage],
      providers: [
        provideRouter([]),
        // No Firebase providers: PrincipalStore settles as 'signedOut'.
        { provide: StoreCatalog, useValue: { listPublished, getProduct: jest.fn() } },
        { provide: ForgeCheckout, useValue: checkoutStub },
        { provide: ForgeEntitlements, useValue: entitlementsStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(CatalogPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders the published products with grants chips and buy microcopy', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    const titles = Array.from(element.querySelectorAll('.product-card h3')).map((heading) =>
      heading.textContent?.trim(),
    );
    expect(titles).toEqual(['Forklift Fundamentals', 'Lockout/Tagout Module', 'Everything Pass']);

    const chips = Array.from(element.querySelectorAll('.chip')).map((chip) =>
      chip.textContent?.trim(),
    );
    expect(chips).toEqual(['Full course', 'Module', 'All access']);

    // Prices live in Stripe: no price on the card, only the microcopy.
    expect(element.textContent).toContain('Price shown at checkout');
  });

  it('shows the owned state instead of a Buy button for owned products', async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;

    const cards = Array.from(element.querySelectorAll('.product-card'));
    const ownedCard = cards.find((card) => card.textContent?.includes('Forklift Fundamentals'));
    const unownedCard = cards.find((card) => card.textContent?.includes('Lockout/Tagout Module'));

    expect(ownedCard?.textContent).toContain('In your library');
    expect(ownedCard?.querySelector('p-button')).toBeNull();
    expect(unownedCard?.querySelector('p-button')).not.toBeNull();
    expect(unownedCard?.textContent).not.toContain('In your library');
  });

  it('redirects a signed-out buyer to /login with a returnUrl', async () => {
    const router = TestBed.inject(Router);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = await render();

    const buyButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'p-button button',
    );
    buyButton?.click();

    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/catalog' },
    });
    expect(checkoutFn).not.toHaveBeenCalled();
  });

  it('shows the cancelled banner when returning with ?cancelled=1', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap({ cancelled: '1' }) } },
    });
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Checkout cancelled');
  });
});
