import { B2C_TENANT_ID } from '@forge/shared';
import { tenantIdFromHost, tenantIdFromLocation } from './tenant-host';

describe('tenantIdFromHost', () => {
  it('resolves the left-most label of a tenant subdomain', () => {
    expect(tenantIdFromHost('acme.soteriaforge.com')).toBe('acme');
    expect(tenantIdFromHost('blue-sky2.soteriaforge.com')).toBe('blue-sky2');
  });

  it('uses the left-most label on deeper hosts', () => {
    expect(tenantIdFromHost('acme.staging.soteriaforge.com')).toBe('acme');
  });

  it('normalizes case and trailing dots', () => {
    expect(tenantIdFromHost('ACME.SoteriaForge.com')).toBe('acme');
    expect(tenantIdFromHost('acme.soteriaforge.com.')).toBe('acme');
  });

  it('maps reserved subdomains to the fallback', () => {
    for (const reserved of ['www', 'app', 'admin', 'api', 'static', 'assets']) {
      expect(tenantIdFromHost(`${reserved}.soteriaforge.com`)).toBe(B2C_TENANT_ID);
    }
  });

  it('maps bare/apex domains to the fallback', () => {
    expect(tenantIdFromHost('soteriaforge.com')).toBe(B2C_TENANT_ID);
    expect(tenantIdFromHost('example.org')).toBe(B2C_TENANT_ID);
  });

  it('maps localhost and IP addresses to the fallback', () => {
    expect(tenantIdFromHost('localhost')).toBe(B2C_TENANT_ID);
    expect(tenantIdFromHost('127.0.0.1')).toBe(B2C_TENANT_ID);
    expect(tenantIdFromHost('192.168.1.50')).toBe(B2C_TENANT_ID);
    expect(tenantIdFromHost('[::1]')).toBe(B2C_TENANT_ID);
  });

  it('rejects labels that are not valid tenant ids', () => {
    expect(tenantIdFromHost('a.soteriaforge.com')).toBe(B2C_TENANT_ID); // too short
    expect(tenantIdFromHost('-bad.soteriaforge.com')).toBe(B2C_TENANT_ID);
  });

  it('honors a custom fallback', () => {
    expect(tenantIdFromHost('localhost', { fallback: 'acme' })).toBe('acme');
    expect(tenantIdFromHost('www.soteriaforge.com', { fallback: 'acme' })).toBe('acme');
  });
});

describe('tenantIdFromLocation', () => {
  it('honors a valid ?tenant= override (the emulator/dev path)', () => {
    expect(tenantIdFromLocation({ hostname: 'localhost', search: '?tenant=acme' })).toBe('acme');
    expect(
      tenantIdFromLocation({ hostname: 'acme.soteriaforge.com', search: '?tenant=globex' }),
    ).toBe('globex');
  });

  it('ignores invalid overrides and falls back to host parsing', () => {
    expect(tenantIdFromLocation({ hostname: 'localhost', search: '?tenant=ACME' })).toBe(
      B2C_TENANT_ID,
    );
    expect(tenantIdFromLocation({ hostname: 'localhost', search: '?tenant=-bad-' })).toBe(
      B2C_TENANT_ID,
    );
    expect(tenantIdFromLocation({ hostname: 'localhost', search: '?tenant=a' })).toBe(
      B2C_TENANT_ID,
    );
    expect(
      tenantIdFromLocation({ hostname: 'acme.soteriaforge.com', search: '?tenant=Bad_Tenant' }),
    ).toBe('acme');
  });

  it('falls back to host parsing when no override is present', () => {
    expect(tenantIdFromLocation({ hostname: 'acme.soteriaforge.com', search: '' })).toBe('acme');
    expect(tenantIdFromLocation({ hostname: 'localhost', search: '?foo=bar' })).toBe(B2C_TENANT_ID);
  });
});
