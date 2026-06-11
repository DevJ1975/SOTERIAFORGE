import { z } from 'zod';
import { customClaims, type Role } from '@forge/shared';

/**
 * Pure authorization helpers. No firebase imports — fully unit-testable.
 */

/**
 * The caller's verified claims (decoded ID token). Parsed through the shared
 * customClaims schema, plus the token's `uid` when present.
 */
const callerClaimsSchema = z.intersection(
  customClaims,
  z.object({ uid: z.string().min(1).optional() }),
);
export type CallerClaims = z.infer<typeof callerClaimsSchema>;

/** Parse an unknown decoded token into CallerClaims, or `null` when it does not carry a valid role. */
export function parseCaller(value: unknown): CallerClaims | null {
  const result = callerClaimsSchema.safeParse(value);
  return result.success ? result.data : null;
}

export interface ManageRoleTarget {
  targetRole: Role;
  targetTenantId?: string;
}

export interface AuthzDecision {
  allowed: boolean;
  reason?: string;
}

/** Roles a tenant_admin may grant within their own tenant. */
const TENANT_ADMIN_GRANTABLE: readonly Role[] = [
  'instructor',
  'learner',
  'b2c_customer',
  'tenant_admin',
];

/**
 * Decide whether `caller` may assign `targetRole` scoped to `targetTenantId`.
 * - superadmin: anything.
 * - tenant_admin: only within their own tenant, never 'superadmin'.
 * - everyone else (including unauthenticated): nothing.
 */
export function canManageRole(
  caller: CallerClaims | null,
  target: ManageRoleTarget,
): AuthzDecision {
  if (!caller) {
    return { allowed: false, reason: 'Caller is unauthenticated or has no valid role claims' };
  }
  if (caller.role === 'superadmin') {
    return { allowed: true };
  }
  if (caller.role === 'tenant_admin') {
    if (target.targetRole === 'superadmin') {
      return { allowed: false, reason: 'tenant_admin may never grant superadmin' };
    }
    if (!TENANT_ADMIN_GRANTABLE.includes(target.targetRole)) {
      return { allowed: false, reason: `tenant_admin may not grant role '${target.targetRole}'` };
    }
    if (!target.targetTenantId || target.targetTenantId !== caller.tenantId) {
      return {
        allowed: false,
        reason: 'tenant_admin may only manage roles within their own tenant',
      };
    }
    return { allowed: true };
  }
  return { allowed: false, reason: `Role '${caller.role}' may not manage roles` };
}
