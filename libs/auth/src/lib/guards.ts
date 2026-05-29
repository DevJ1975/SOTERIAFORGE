import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { Role } from '@forge/shared';
import { AuthService } from './auth.service';
import { canAccessTenant, hasRole, isSuperadmin } from './claims';
import { TenantService } from './tenant.service';

/** Requires an authenticated user; redirects to /login otherwise. */
export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.claims()) {
    await auth.refreshClaims();
  }
  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Requires one of the given roles. Usage: `roleGuard('tenant_admin', 'instructor')`. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.claims()) await auth.refreshClaims();
    const claims = auth.claims();

    if (claims && (isSuperadmin(claims) || hasRole(claims, ...roles))) return true;
    return router.createUrlTree(['/forbidden']);
  };
}

/** Platform-only guard for the superadmin console. */
export const superadminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.claims()) await auth.refreshClaims();
  return isSuperadmin(auth.claims()) ? true : router.createUrlTree(['/forbidden']);
};

/**
 * Ensures the authenticated user's claim tenant matches the host-resolved
 * tenant — the client-side half of tenant isolation (Firestore rules enforce
 * the authoritative half).
 */
export const tenantGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const tenant = inject(TenantService);
  const router = inject(Router);

  if (!auth.claims()) await auth.refreshClaims();
  const claims = auth.claims();
  const activeTenant = tenant.tenantId();

  if (claims && activeTenant && canAccessTenant(claims, activeTenant)) return true;
  return router.createUrlTree(['/forbidden']);
};
