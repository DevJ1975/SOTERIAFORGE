import { inject, Injector } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Role } from '@forge/shared';
import { AuthStatus, PrincipalStore } from './principal.store';

type Principal = InstanceType<typeof PrincipalStore>;

/**
 * Resolves once the auth state has settled (i.e. is no longer 'loading').
 * Kicks init() defensively in case the app hasn't done so yet — it is
 * idempotent and settles immediately when Firebase is unavailable.
 */
function settledStatus(store: Principal, injector: Injector): Promise<AuthStatus> {
  store.init();
  if (store.status() !== 'loading') return Promise.resolve(store.status());
  return firstValueFrom(
    toObservable(store.status, { injector }).pipe(filter((status) => status !== 'loading')),
  );
}

/** Allows signed-in users; otherwise redirects to /login with a returnUrl. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const store = inject(PrincipalStore);
  const router = inject(Router);
  const injector = inject(Injector);

  const status = await settledStatus(store, injector);
  if (status === 'signedIn') return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Factory: allows signed-in users whose role is one of `roles`.
 * Superadmin always passes; everyone else is sent home.
 */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return async () => {
    const store = inject(PrincipalStore);
    const router = inject(Router);
    const injector = inject(Injector);

    const status = await settledStatus(store, injector);
    if (status === 'signedIn') {
      if (store.isSuperadmin()) return true;
      const role = store.role();
      if (role !== null && roles.includes(role)) return true;
    }
    return router.createUrlTree(['/']);
  };
}
