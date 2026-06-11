import { parseClaims } from './claims';

describe('parseClaims', () => {
  it('parses valid tenant-scoped claims (extra token claims stripped)', () => {
    const claims = parseClaims({
      role: 'learner',
      tenantId: 'acme',
      // standard JWT noise present on real ID tokens:
      iss: 'https://securetoken.google.com/soteria-forge-dev',
      aud: 'soteria-forge-dev',
      user_id: 'abc123',
    });
    expect(claims).toEqual({ role: 'learner', tenantId: 'acme', entitlements: [] });
  });

  it('keeps entitlements and gcipTenantId when present', () => {
    const claims = parseClaims({
      role: 'b2c_customer',
      tenantId: 'b2c',
      entitlements: ['prod_123'],
      gcipTenantId: 'gcip-abc',
    });
    expect(claims).toEqual({
      role: 'b2c_customer',
      tenantId: 'b2c',
      entitlements: ['prod_123'],
      gcipTenantId: 'gcip-abc',
    });
  });

  it('returns null when role is missing', () => {
    expect(parseClaims({ tenantId: 'acme' })).toBeNull();
    expect(parseClaims({})).toBeNull();
  });

  it('returns null for unknown roles', () => {
    expect(parseClaims({ role: 'godmode', tenantId: 'acme' })).toBeNull();
  });

  it('allows superadmin without a tenantId', () => {
    expect(parseClaims({ role: 'superadmin' })).toEqual({
      role: 'superadmin',
      entitlements: [],
    });
  });

  it('returns null for tenant-scoped roles without a tenantId', () => {
    expect(parseClaims({ role: 'learner' })).toBeNull();
    expect(parseClaims({ role: 'tenant_admin' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseClaims(null)).toBeNull();
    expect(parseClaims(undefined)).toBeNull();
    expect(parseClaims('learner')).toBeNull();
  });
});
