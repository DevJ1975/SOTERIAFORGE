import { B2C_TENANT_ID, RESERVED_SUBDOMAINS, tenantId as tenantIdSchema } from '@forge/shared';

/**
 * Pure hostname → tenantId resolution. No Angular, no Firebase — unit-testable.
 *
 * Multi-tenant routing convention: `acme.soteriaforge.com` → tenant `acme`.
 * Reserved subdomains, apex/bare domains, localhost and raw IPs all resolve
 * to the fallback (the public B2C tenant by default).
 */

const RESERVED = new Set<string>(RESERVED_SUBDOMAINS);
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpAddress(host: string): boolean {
  // IPv6 hosts contain ':' (possibly bracketed); IPv4 is dotted-quad.
  return host.includes(':') || IPV4_RE.test(host);
}

function isValidTenantId(candidate: string): boolean {
  return tenantIdSchema.safeParse(candidate).success;
}

/** Resolves the tenant id encoded in a hostname's left-most label. */
export function tenantIdFromHost(hostname: string, opts?: { fallback?: string }): string {
  const fallback = opts?.fallback ?? B2C_TENANT_ID;
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || isIpAddress(host)) return fallback;

  const labels = host.split('.');
  // 'localhost' and apex domains ('soteriaforge.com') carry no tenant label.
  if (labels.length < 3) return fallback;

  const sub = labels[0];
  if (RESERVED.has(sub) || !isValidTenantId(sub)) return fallback;
  return sub;
}

/**
 * Like {@link tenantIdFromHost} but honors a `?tenant=x` query override —
 * the dev/emulator way to simulate tenants on localhost. Invalid overrides
 * (not a lowercase DNS label) are ignored.
 */
export function tenantIdFromLocation(
  loc: { hostname: string; search: string },
  opts?: { fallback?: string },
): string {
  const override = new URLSearchParams(loc.search).get('tenant')?.trim();
  if (override && isValidTenantId(override)) return override;
  return tenantIdFromHost(loc.hostname, opts);
}
