import {
  AUTHORING_ROLES,
  type CustomClaims,
  type Principal,
  type Role,
  customClaims,
  tryParse,
} from '@assurance/shared';

/** Parse raw Firebase ID-token claims into a validated CustomClaims, or null. */
export function parseClaims(raw: unknown): CustomClaims | null {
  const result = tryParse(customClaims, raw);
  return result.ok ? result.value : null;
}

export function isSuperadmin(claims: CustomClaims | null | undefined): boolean {
  return claims?.role === 'superadmin';
}

export function hasRole(claims: CustomClaims | null | undefined, ...roles: Role[]): boolean {
  return !!claims && roles.includes(claims.role);
}

export function canAuthor(claims: CustomClaims | null | undefined): boolean {
  return !!claims && AUTHORING_ROLES.includes(claims.role);
}

/**
 * Whether the principal may act within the given tenant. Superadmin may act
 * anywhere; everyone else only within their own tenant claim.
 */
export function canAccessTenant(
  claims: CustomClaims | null | undefined,
  tenantId: string,
): boolean {
  if (!claims) return false;
  if (claims.role === 'superadmin') return true;
  return claims.tenantId === tenantId;
}

export function hasEntitlement(
  claims: CustomClaims | null | undefined,
  productId: string,
): boolean {
  return !!claims?.entitlements?.includes(productId);
}

export function toPrincipal(
  uid: string,
  email: string | undefined,
  displayName: string | undefined,
  claims: CustomClaims,
): Principal {
  return { uid, email, displayName, claims };
}
