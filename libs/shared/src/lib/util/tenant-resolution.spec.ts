import { resolveTenantFromHost } from './tenant-resolution';

const opts = { rootDomain: 'soteriaforge.com' };

describe('resolveTenantFromHost', () => {
  it('resolves a tenant subdomain', () => {
    expect(resolveTenantFromHost('acme.soteriaforge.com', opts)).toEqual({
      tenantId: 'acme',
      isB2c: false,
      via: 'subdomain',
    });
  });

  it('resolves the apex to the B2C storefront', () => {
    expect(resolveTenantFromHost('soteriaforge.com', opts).tenantId).toBe('b2c');
    expect(resolveTenantFromHost('www.soteriaforge.com', opts).isB2c).toBe(true);
  });

  it('ignores reserved subdomains', () => {
    expect(resolveTenantFromHost('app.soteriaforge.com', opts).tenantId).toBeNull();
    expect(resolveTenantFromHost('api.soteriaforge.com', opts).tenantId).toBeNull();
  });

  it('strips ports and is case-insensitive', () => {
    expect(resolveTenantFromHost('ACME.soteriaforge.com:4200', opts).tenantId).toBe('acme');
  });

  it('honours explicit custom-domain mappings', () => {
    const r = resolveTenantFromHost('learn.acme.io', {
      ...opts,
      customDomains: { 'learn.acme.io': 'acme' },
    });
    expect(r).toEqual({ tenantId: 'acme', isB2c: false, via: 'custom-domain' });
  });

  describe('Railway host layout (docs/railway-go-live-plan.md, D2)', () => {
    const staging = { rootDomain: 'staging.soteriaforge.com' };

    it('resolves tenants under the staging root', () => {
      expect(resolveTenantFromHost('lakewood.staging.soteriaforge.com', staging).tenantId).toBe(
        'lakewood',
      );
      expect(resolveTenantFromHost('api.staging.soteriaforge.com', staging).tenantId).toBeNull();
      expect(resolveTenantFromHost('app.staging.soteriaforge.com', staging).tenantId).toBeNull();
    });

    it('does not treat a production tenant host as staging, or the reverse', () => {
      expect(resolveTenantFromHost('lakewood.soteriaforge.com', staging).via).toBe('none');
      expect(resolveTenantFromHost('lakewood.staging.soteriaforge.com', opts).tenantId).toBeNull();
    });

    it('resolves the tenant admin host only for the admin root', () => {
      const admin = { rootDomain: 'admin.soteriaforge.com' };
      expect(resolveTenantFromHost('lakewood.admin.soteriaforge.com', admin).tenantId).toBe(
        'lakewood',
      );
      // The learner app never takes an admin host for a tenant.
      expect(resolveTenantFromHost('lakewood.admin.soteriaforge.com', opts).tenantId).toBeNull();
    });

    it('resolves no tenant on a Railway-generated domain', () => {
      expect(resolveTenantFromHost('learner-production-1a2b.up.railway.app', opts).via).toBe(
        'none',
      );
    });
  });

  it('returns null for unrelated hosts', () => {
    expect(resolveTenantFromHost('example.org', opts).via).toBe('none');
    expect(resolveTenantFromHost(null, opts).tenantId).toBeNull();
  });
});
