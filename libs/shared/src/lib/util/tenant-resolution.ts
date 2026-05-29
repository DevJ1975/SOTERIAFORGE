import { B2C_TENANT_ID, RESERVED_SUBDOMAINS } from '../constants';

export interface TenantResolution {
  tenantId: string | null;
  /** True when the host resolves to the public B2C storefront tenant. */
  isB2c: boolean;
  /** The matched strategy, for diagnostics. */
  via: 'subdomain' | 'custom-domain' | 'b2c-apex' | 'none';
}

export interface ResolveTenantOptions {
  /** The platform apex, e.g. "soteriaforge.com". */
  rootDomain: string;
  /** Apex/host that maps to the B2C storefront (defaults to the root domain). */
  b2cHost?: string;
  /** Known custom-domain -> tenantId mappings (Phase 1+). */
  customDomains?: Record<string, string>;
}

/**
 * Resolve the active tenant from a request host.
 *
 * Strategy (subdomain-based, per locked decision):
 *   acme.soteriaforge.com        -> tenantId "acme"
 *   soteriaforge.com / www.*     -> B2C storefront tenant
 *   custom domain (mapped)       -> mapped tenantId
 *
 * This is a pure function so it can run identically in the browser, in
 * Angular SSR/edge, and in Cloud Functions.
 */
export function resolveTenantFromHost(
  host: string | null | undefined,
  options: ResolveTenantOptions,
): TenantResolution {
  if (!host) {
    return { tenantId: null, isB2c: false, via: 'none' };
  }

  // Strip port and lowercase.
  const cleanHost = host.split(':')[0].trim().toLowerCase();
  const { rootDomain, b2cHost, customDomains } = options;
  const b2cApex = (b2cHost ?? rootDomain).toLowerCase();

  // 1) Explicit custom-domain mapping wins.
  if (customDomains && customDomains[cleanHost]) {
    const mapped = customDomains[cleanHost];
    return {
      tenantId: mapped,
      isB2c: mapped === B2C_TENANT_ID,
      via: 'custom-domain',
    };
  }

  // 2) B2C apex (and www).
  if (cleanHost === b2cApex || cleanHost === `www.${b2cApex}`) {
    return { tenantId: B2C_TENANT_ID, isB2c: true, via: 'b2c-apex' };
  }

  // 3) Subdomain of the root domain.
  if (cleanHost.endsWith(`.${rootDomain}`)) {
    const sub = cleanHost.slice(0, -1 * `.${rootDomain}`.length);
    // Only the left-most label is the tenant; ignore deeper nesting.
    const label = sub.split('.').pop() ?? '';
    if (!label || RESERVED_SUBDOMAINS.includes(label as (typeof RESERVED_SUBDOMAINS)[number])) {
      return { tenantId: null, isB2c: false, via: 'none' };
    }
    return { tenantId: label, isB2c: label === B2C_TENANT_ID, via: 'subdomain' };
  }

  return { tenantId: null, isB2c: false, via: 'none' };
}
