import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { CustomClaims, Role } from '@assurance/shared';
import { AuthService } from './auth.service';
import { canAccessTenant, hasRole, isSuperadmin } from './claims';
import { ForgeSession } from './forge-api';
import { TenantService } from './tenant.service';

/**
 * The role and tenant guards decide on, from Postgres via `/api/me`. A refusal
 * there, or no session, denies.
 *
 * Guards are UX; the API enforces access server-side.
 */
async function access(auth: AuthService, session: ForgeSession): Promise<CustomClaims | null> {
  const api = await session.settled();
  if (api.kind !== 'member' || api.me.member.status !== 'active') return null;
  return auth.claims();
}

/** Requires an authenticated user; redirects to /login otherwise. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready();
  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Requires one of the given roles. Usage: `roleGuard('tenant_admin', 'instructor')`. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const session = inject(ForgeSession);
    const router = inject(Router);

    const who = await access(auth, session);
    if (who && (isSuperadmin(who) || hasRole(who, ...roles))) return true;
    return router.createUrlTree(['/forbidden']);
  };
}

/** Platform-only guard for the superadmin console. */
export const superadminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const session = inject(ForgeSession);
  const router = inject(Router);
  return isSuperadmin(await access(auth, session)) ? true : router.createUrlTree(['/forbidden']);
};

/**
 * Ensures the user may act in the host-resolved tenant — the client-side half
 * of tenant isolation (the API enforces the authoritative half).
 */
export const tenantGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const session = inject(ForgeSession);
  const tenant = inject(TenantService);
  const router = inject(Router);

  const who = await access(auth, session);
  const activeTenant = tenant.tenantId();
  if (who && activeTenant && canAccessTenant(who, activeTenant)) return true;
  return router.createUrlTree(['/forbidden']);
};
