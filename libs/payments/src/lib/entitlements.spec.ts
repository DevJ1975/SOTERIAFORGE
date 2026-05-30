import type { CatalogProduct } from '@assurance/shared';
import { isEntitled, resolveAccess } from './entitlements';

// ---------------------------------------------------------------------------
// Helpers to construct minimal CatalogProduct test fixtures.
// All required fields from the `catalogProduct` Zod schema must be present.
// ---------------------------------------------------------------------------
const NOW = '2024-01-01T00:00:00.000Z';

function makeProduct(
  overrides: Partial<CatalogProduct> & Pick<CatalogProduct, 'id' | 'grants'>,
): CatalogProduct {
  const defaults: CatalogProduct = {
    createdAt: NOW,
    id: overrides.id,
    title: `Product ${overrides.id}`,
    description: '',
    grants: overrides.grants,
    stripePriceId: 'price_test_123',
    mode: 'payment',
    published: true,
  };
  return { ...defaults, ...overrides };
}

const courseProduct = makeProduct({
  id: 'course-intro-to-safety',
  title: 'Intro to Safety',
  grants: { kind: 'course', refId: 'course-intro-to-safety' },
});

const moduleProduct = makeProduct({
  id: 'module-chapter-1',
  title: 'Chapter 1',
  grants: { kind: 'module', refId: 'module-chapter-1' },
});

const allAccessProduct = makeProduct({
  id: 'tier-all-access',
  title: 'All-Access Pass',
  grants: { kind: 'all_access' },
  mode: 'subscription',
});

// ---------------------------------------------------------------------------
// isEntitled
// ---------------------------------------------------------------------------
describe('isEntitled', () => {
  it('returns true when productId is in the entitlements array', () => {
    expect(
      isEntitled(['course-intro-to-safety', 'module-chapter-1'], 'course-intro-to-safety'),
    ).toBe(true);
  });

  it('returns false when productId is NOT in the entitlements array', () => {
    expect(isEntitled(['course-intro-to-safety'], 'module-chapter-1')).toBe(false);
  });

  it('returns false for empty entitlements', () => {
    expect(isEntitled([], 'course-intro-to-safety')).toBe(false);
  });

  it('returns true when the all_access sentinel is present, regardless of productId', () => {
    expect(isEntitled(['all_access'], 'any-product-id')).toBe(true);
    expect(isEntitled(['all_access'], 'course-not-purchased')).toBe(true);
    expect(isEntitled(['all_access', 'other-product'], 'completely-different-product')).toBe(true);
  });

  it('returns true when all_access sentinel is present alongside other entitlements', () => {
    expect(isEntitled(['course-abc', 'all_access'], 'course-xyz')).toBe(true);
  });

  it('is case-sensitive — does not treat All_Access as a sentinel', () => {
    expect(isEntitled(['All_Access'], 'some-product')).toBe(false);
    expect(isEntitled(['ALL_ACCESS'], 'some-product')).toBe(false);
  });

  it('does not match a productId that is a prefix of another', () => {
    expect(isEntitled(['course-intro'], 'course-intro-to-safety')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveAccess — all_access sentinel in entitlements
// ---------------------------------------------------------------------------
describe('resolveAccess — all_access sentinel in entitlements', () => {
  it('allows access to a course product when user holds all_access sentinel', () => {
    const result = resolveAccess(courseProduct, ['all_access']);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows access to a module product when user holds all_access sentinel', () => {
    const result = resolveAccess(moduleProduct, ['all_access']);
    expect(result.allowed).toBe(true);
  });

  it('allows access to an all_access-kind product when user holds all_access sentinel', () => {
    const result = resolveAccess(allAccessProduct, ['all_access']);
    expect(result.allowed).toBe(true);
  });

  it('all_access sentinel takes priority even with no other entitlements', () => {
    const result = resolveAccess(courseProduct, ['all_access']);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveAccess — product.grants.kind === 'all_access'
// ---------------------------------------------------------------------------
describe('resolveAccess — product.grants.kind === all_access', () => {
  it('allows access when user owns the all_access-kind product', () => {
    const result = resolveAccess(allAccessProduct, ['tier-all-access']);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('denies access when user does NOT own the all_access-kind product', () => {
    const result = resolveAccess(allAccessProduct, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe('string');
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it('denial reason for all_access-kind product references the product title', () => {
    const result = resolveAccess(allAccessProduct, ['some-other-product']);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('All-Access Pass');
  });

  it('denies when user holds a different entitlement but not the all_access product itself', () => {
    const result = resolveAccess(allAccessProduct, ['course-intro-to-safety']);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveAccess — course product
// ---------------------------------------------------------------------------
describe('resolveAccess — course product', () => {
  it('allows access when the user holds the course productId', () => {
    const result = resolveAccess(courseProduct, ['course-intro-to-safety']);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('denies access when the user has no matching entitlement', () => {
    const result = resolveAccess(courseProduct, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('denies when user holds a different course entitlement', () => {
    const result = resolveAccess(courseProduct, ['course-some-other-course']);
    expect(result.allowed).toBe(false);
  });

  it('denial reason references the product title', () => {
    const result = resolveAccess(courseProduct, []);
    expect(result.reason).toContain('Intro to Safety');
  });
});

// ---------------------------------------------------------------------------
// resolveAccess — module product
// ---------------------------------------------------------------------------
describe('resolveAccess — module product', () => {
  it('allows access when the user holds the module productId', () => {
    const result = resolveAccess(moduleProduct, ['module-chapter-1']);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('denies access when the user has no matching entitlement', () => {
    const result = resolveAccess(moduleProduct, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('denies when user holds the course entitlement but not this module', () => {
    const result = resolveAccess(moduleProduct, ['course-intro-to-safety']);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveAccess — edge cases
// ---------------------------------------------------------------------------
describe('resolveAccess — edge cases', () => {
  it('does not return a reason when access is allowed', () => {
    const result = resolveAccess(courseProduct, ['course-intro-to-safety']);
    expect(result).not.toHaveProperty('reason');
  });

  it('allowed result has no reason even for all_access sentinel', () => {
    const result = resolveAccess(moduleProduct, ['all_access']);
    expect(result.allowed).toBe(true);
    // reason should be undefined (not just falsy)
    expect(result.reason).toBeUndefined();
  });

  it('combines multiple entitlements correctly', () => {
    const entitlements = ['course-intro-to-safety', 'module-chapter-1'];
    expect(resolveAccess(courseProduct, entitlements).allowed).toBe(true);
    expect(resolveAccess(moduleProduct, entitlements).allowed).toBe(true);
    expect(resolveAccess(allAccessProduct, entitlements).allowed).toBe(false);
  });

  it('returned AccessResult shape: allowed:true has no reason key', () => {
    const result = resolveAccess(courseProduct, ['course-intro-to-safety']);
    // Checking allowed=true result has no extra keys beyond 'allowed'
    expect(Object.keys(result)).toEqual(['allowed']);
  });

  it('returned AccessResult shape: allowed:false has both allowed and reason', () => {
    const result = resolveAccess(courseProduct, []);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason!.trim().length).toBeGreaterThan(0);
  });

  it('handles product with no optional fields (no refId, no previewUrl)', () => {
    const minimal = makeProduct({
      id: 'minimal-product',
      grants: { kind: 'course' }, // refId is optional
    });
    expect(resolveAccess(minimal, ['minimal-product']).allowed).toBe(true);
    expect(resolveAccess(minimal, []).allowed).toBe(false);
  });

  it('subscription mode product behaves like payment mode for entitlement check', () => {
    const subProduct = makeProduct({
      id: 'sub-monthly',
      grants: { kind: 'module', refId: 'module-abc' },
      mode: 'subscription',
    });
    expect(resolveAccess(subProduct, ['sub-monthly']).allowed).toBe(true);
    expect(resolveAccess(subProduct, []).allowed).toBe(false);
  });
});
