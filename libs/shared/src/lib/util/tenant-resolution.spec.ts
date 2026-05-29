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

  it('returns null for unrelated hosts', () => {
    expect(resolveTenantFromHost('example.org', opts).via).toBe('none');
    expect(resolveTenantFromHost(null, opts).tenantId).toBeNull();
  });
});
