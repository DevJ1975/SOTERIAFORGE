import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { CatalogProduct } from '@forge/shared';
import { CatalogPage } from './catalog-page';
import { CatalogAdminService } from './catalog-admin.service';

const courseProduct: CatalogProduct = {
  id: 'prod-course',
  title: 'Fire Safety Fundamentals',
  description: 'Everything a new hire needs.',
  grants: { kind: 'course', refId: 'course-fire-safety' },
  stripePriceId: 'price_course123',
  mode: 'payment',
  published: true,
  createdAt: '2026-02-01T00:00:00.000Z',
};

const allAccessDraft: CatalogProduct = {
  id: 'prod-all',
  title: 'All Access Pass',
  description: '',
  grants: { kind: 'all_access' },
  stripePriceId: 'price_allaccess',
  mode: 'subscription',
  published: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

type ServiceStub = {
  list: jest.Mock<Promise<CatalogProduct[]>, []>;
  save: jest.Mock<Promise<void>, [CatalogProduct]>;
  delete: jest.Mock<Promise<void>, [string]>;
};

describe('CatalogPage', () => {
  let service: ServiceStub;

  function configure(products: CatalogProduct[]): void {
    service = {
      list: jest.fn().mockResolvedValue(products),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [CatalogPage],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: CatalogAdminService, useValue: service },
      ],
    });
  }

  async function render() {
    const fixture = TestBed.createComponent(CatalogPage);
    fixture.detectChanges(); // kicks ngOnInit
    await fixture.whenStable(); // list() resolves
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Settles pending promise chains without fixture.whenStable(): the success /
   * error toast arms a 5s auto-dismiss setTimeout, which keeps the Angular
   * zone unstable and would stall whenStable() past the jest timeout.
   */
  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('renders every catalog doc (published and drafts) with chips and price ids', async () => {
    configure([courseProduct, allAccessDraft]);
    const fixture = await render();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(text).toContain('Fire Safety Fundamentals');
    expect(text).toContain('All Access Pass');
    expect(text).toContain('Course');
    expect(text).toContain('All access');
    expect(text).toContain('One-time');
    expect(text).toContain('Subscription');
    expect(text).toContain('price_course123');
    expect(text).toContain('price_allaccess');
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.product-row:not(.head)'),
    ).toHaveLength(2);
  });

  it('shows the empty state when the catalog has no products', async () => {
    configure([]);
    const fixture = await render();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(
      'No products yet — create the first thing your storefront sells.',
    );
    expect(el.querySelector('.product-row')).toBeNull();
  });

  it('saves through the service when the publish toggle is flipped', async () => {
    configure([allAccessDraft]);
    const fixture = await render();

    const toggle = (fixture.nativeElement as HTMLElement).querySelector('p-togglebutton');
    expect(toggle).not.toBeNull();
    (toggle as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    fixture.detectChanges();

    expect(service.save).toHaveBeenCalledTimes(1);
    const saved = service.save.mock.calls[0][0];
    expect(saved).toMatchObject({ id: 'prod-all', published: true });
    expect(saved.updatedAt).toBeDefined();
  });

  it('rolls the toggle back when the save is rejected', async () => {
    configure([allAccessDraft]);
    const fixture = await render();
    service.save.mockRejectedValueOnce(new Error('rules: superadmin only'));

    const toggle = (fixture.nativeElement as HTMLElement).querySelector('p-togglebutton');
    (toggle as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    fixture.detectChanges(); // rollback re-creates the row…
    await flush();
    fixture.detectChanges(); // …and NgModel writes its initial value async

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('rules: superadmin only');
    // The optimistic flip was rolled back to draft.
    expect(text).toContain('Draft');
  });
});
