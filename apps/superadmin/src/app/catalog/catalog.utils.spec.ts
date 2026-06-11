import type { CatalogProduct } from '@forge/shared';
import { catalogProduct } from '@forge/shared';
import {
  buildProduct,
  createProductId,
  grantsChipLabel,
  modeChipLabel,
  newProductForm,
  productToForm,
  sortProducts,
  upsertProduct,
  zodIssuesToFieldErrors,
  type ProductFormModel,
} from './catalog.utils';

const NOW = '2026-06-11T10:00:00.000Z';

const validForm: ProductFormModel = {
  title: 'Fire Safety Fundamentals',
  description: 'Everything a new hire needs.',
  grantsKind: 'course',
  grantsRefId: 'course-fire-safety',
  stripePriceId: 'price_1NXabc',
  mode: 'payment',
  previewUrl: '',
  published: false,
};

const existing: CatalogProduct = {
  id: 'prod-existing',
  title: 'Old title',
  description: 'Old description',
  grants: { kind: 'course', refId: 'course-old' },
  stripePriceId: 'price_old',
  mode: 'payment',
  published: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'uid-author',
};

describe('newProductForm', () => {
  it('defaults to an unpublished one-time course unlock with empty fields', () => {
    expect(newProductForm()).toEqual({
      title: '',
      description: '',
      grantsKind: 'course',
      grantsRefId: '',
      stripePriceId: '',
      mode: 'payment',
      previewUrl: '',
      published: false,
    });
  });
});

describe('productToForm', () => {
  it('flattens grants and fills optionals with empty strings', () => {
    expect(productToForm(existing)).toEqual({
      title: 'Old title',
      description: 'Old description',
      grantsKind: 'course',
      grantsRefId: 'course-old',
      stripePriceId: 'price_old',
      mode: 'payment',
      previewUrl: '',
      published: true,
    });
  });
});

describe('createProductId', () => {
  it('generates prod-prefixed ids', () => {
    expect(createProductId()).toMatch(/^prod-[a-z0-9]+$/);
  });
});

describe('buildProduct', () => {
  it('builds a new product with a generated prod- id and createdAt = now', () => {
    const result = buildProduct(validForm, null, NOW);
    expect(result.errors).toBeNull();
    expect(result.product).toMatchObject({
      title: 'Fire Safety Fundamentals',
      grants: { kind: 'course', refId: 'course-fire-safety' },
      stripePriceId: 'price_1NXabc',
      mode: 'payment',
      published: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.product?.id).toMatch(/^prod-/);
    expect(result.product?.previewUrl).toBeUndefined();
  });

  it('keeps id, createdAt and createdBy when editing and stamps updatedAt', () => {
    const result = buildProduct(validForm, existing, NOW);
    expect(result.product).toMatchObject({
      id: 'prod-existing',
      createdAt: existing.createdAt,
      createdBy: 'uid-author',
      updatedAt: NOW,
    });
  });

  it('trims free-text fields and keeps a valid previewUrl', () => {
    const result = buildProduct(
      {
        ...validForm,
        title: '  Spaced out  ',
        stripePriceId: ' price_x ',
        previewUrl: ' https://example.com/preview ',
      },
      null,
      NOW,
    );
    expect(result.product).toMatchObject({
      title: 'Spaced out',
      stripePriceId: 'price_x',
      previewUrl: 'https://example.com/preview',
    });
  });

  it('requires a refId for course and module grants', () => {
    const result = buildProduct({ ...validForm, grantsRefId: '   ' }, null, NOW);
    expect(result.product).toBeNull();
    expect(result.errors?.grantsRefId).toContain('course id');
  });

  it('omits refId entirely for all_access grants', () => {
    const result = buildProduct(
      { ...validForm, grantsKind: 'all_access', grantsRefId: 'ignored' },
      null,
      NOW,
    );
    expect(result.errors).toBeNull();
    expect(result.product?.grants).toEqual({ kind: 'all_access' });
  });

  it('maps zod failures to inline field messages', () => {
    const result = buildProduct(
      { ...validForm, title: '', stripePriceId: '', previewUrl: 'not-a-url' },
      null,
      NOW,
    );
    expect(result.product).toBeNull();
    expect(result.errors).toMatchObject({
      title: 'Required.',
      stripePriceId: 'Required.',
      previewUrl: expect.stringContaining('valid URL'),
    });
  });

  it('produces a document the shared schema accepts', () => {
    const result = buildProduct(validForm, existing, NOW);
    expect(result.product).not.toBeNull();
    expect(() => catalogProduct.parse(result.product)).not.toThrow();
  });
});

describe('zodIssuesToFieldErrors', () => {
  it('maps nested grants paths onto the flat form fields', () => {
    const parsed = catalogProduct.safeParse({
      id: 'prod-x',
      title: 'ok',
      description: '',
      grants: { kind: 'course', refId: 42 },
      stripePriceId: 'price_x',
      mode: 'payment',
      published: false,
      createdAt: NOW,
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const errors = zodIssuesToFieldErrors(parsed.error.issues);
    expect(errors.grantsRefId).toBeDefined();
  });

  it('buckets unmapped issues under form', () => {
    const parsed = catalogProduct.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const errors = zodIssuesToFieldErrors(
      parsed.error.issues.filter((issue) => issue.path[0] === 'id'),
    );
    expect(errors.form).toBeDefined();
  });
});

describe('chip labels', () => {
  it('labels grants kinds', () => {
    expect(grantsChipLabel('course')).toBe('Course');
    expect(grantsChipLabel('module')).toBe('Module');
    expect(grantsChipLabel('all_access')).toBe('All access');
  });

  it("labels checkout modes as 'One-time' / 'Subscription'", () => {
    expect(modeChipLabel('payment')).toBe('One-time');
    expect(modeChipLabel('subscription')).toBe('Subscription');
  });
});

describe('sortProducts / upsertProduct', () => {
  const a: CatalogProduct = {
    ...existing,
    id: 'prod-a',
    title: 'Alpha',
    createdAt: '2026-02-01T00:00:00.000Z',
  };
  const b: CatalogProduct = {
    ...existing,
    id: 'prod-b',
    title: 'Beta',
    createdAt: '2026-03-01T00:00:00.000Z',
  };

  it('sorts newest first without mutating the input', () => {
    const input = [a, b];
    expect(sortProducts(input).map((p) => p.id)).toEqual(['prod-b', 'prod-a']);
    expect(input.map((p) => p.id)).toEqual(['prod-a', 'prod-b']);
  });

  it('replaces an existing product by id and inserts new ones in order', () => {
    const replaced = upsertProduct([a, b], { ...a, title: 'Alpha v2' });
    expect(replaced.map((p) => p.title)).toEqual(['Beta', 'Alpha v2']);

    const c: CatalogProduct = { ...existing, id: 'prod-c', createdAt: '2026-04-01T00:00:00.000Z' };
    expect(upsertProduct([a, b], c).map((p) => p.id)).toEqual(['prod-c', 'prod-b', 'prod-a']);
  });
});
