import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { CustomClaims, Role } from '@assurance/shared';
import { AuthService } from './auth.service';
import { canAccessTenant, hasRole, isSuperadmin } from './claims';
import { ForgeSession } from './forge-api';
import { TenantService } from './tenant.service';

/**
 * The role and tenant guards decide on. Postgres (via `/api/me`) is the source
 * of truth when the app has an API: a refusal there denies even if stale
 * Firebase claims would allow. Only when the API is unavailable (none
 * configured, or down) do guards fall back to claims.
 *
 * Guards are UX; the API and security rules enforce access server-side.
 */
async function access(auth: AuthService, session: ForgeSession): Promise<CustomClaims | null> {
  const api = await session.settled();
  if (api.kind === 'member') {
    const { member, tenant } = api.me;
    if (member.status !== 'active') return null;
    return {
      role: member.role,
      tenantId: tenant?.id ?? member.tenantId ?? undefined,
      entitlements: auth.claims()?.entitlements ?? [],
    };
  }
  if (api.kind === 'denied') return null;
  if (!auth.claims()) await auth.refreshClaims();
  return auth.claims();
}

/** Requires an authenticated user; redirects to /login otherwise. */
export const authGuard: CanActivateFn = async (_route, state) => {
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
 * of tenant isolation (the API and Firestore rules enforce the authoritative half).
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
