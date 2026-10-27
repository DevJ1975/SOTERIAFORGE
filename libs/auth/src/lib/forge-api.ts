import {
  type EnvironmentProviders,
  Injectable,
  computed,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { type HttpInterceptorFn, type HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import type { Role } from '@assurance/shared';
import { ASSURANCE_ENV } from './assurance-environment';
import { AuthService } from './auth.service';
import { type ForgeMe, forgeApiUrl } from './forge-me';
import { TenantService } from './tenant.service';

export { type ForgeMe, forgeApiUrl } from './forge-me';

/**
 * What the API says about the signed-in user, for route guards:
 * - `member`: use this membership (Postgres is the source of truth for roles)
 * - `denied`: the API refused (401/403: not a member, deactivated, wrong tenant)
 * - `unavailable`: no API configured, nobody signed in, or the API is down
 */
export type ForgeAccess =
  | { kind: 'member'; me: ForgeMe }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

/**
 * Sends the access token and the host-resolved tenant to the Forge API, and only
 * to it: requests elsewhere never carry the token. A 401 gets one retry with a
 * renewed token (it may have expired in flight).
 */
export const forgeApiInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(ASSURANCE_ENV).apiBaseUrl;
  if (!base || !req.url.startsWith(forgeApiUrl(base, ''))) return next(req);

  const auth = inject(AuthService);
  const tenantId = inject(TenantService).tenantId();
  const withHeaders = (token: string | null): HttpRequest<unknown> => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (tenantId) headers['X-Forge-Tenant'] = tenantId;
    return req.clone({ setHeaders: headers });
  };

  return from(auth.getAccessToken()).pipe(
    switchMap((token) =>
      next(withHeaders(token)).pipe(
        catchError((err: unknown) => {
          if (!token || !(err instanceof HttpErrorResponse) || err.status !== 401) {
            return throwError(() => err);
          }
          return from(auth.renewAccessToken()).pipe(
            switchMap((renewed) => (renewed ? next(withHeaders(renewed)) : throwError(() => err))),
          );
        }),
      ),
    ),
  );
};

/**
 * The signed-in user as the Forge API sees them (membership, role, tenant).
 * Postgres is the source of truth for roles (docs/forge-platform-plan.md §2).
 */
@Injectable({ providedIn: 'root' })
export class ForgeSession {
  private readonly auth = inject(AuthService);

  readonly me = this.auth.me;
  readonly role = computed<Role | null>(() => this.me()?.member.role ?? null);
  readonly canAuthor = computed(() => this.me()?.canAuthor ?? false);

  /** Waits for the session restore, then classifies the result. */
  async settled(): Promise<ForgeAccess> {
    await this.auth.ready();
    const me = this.me();
    if (me) return { kind: 'member', me };
    const status = this.auth.meStatus();
    return status === 401 || status === 403 ? { kind: 'denied' } : { kind: 'unavailable' };
  }
}

/** Starts the API session with the app. Pair with `withInterceptors([forgeApiInterceptor])`. */
export function provideForgeApi(): EnvironmentProviders {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => inject(ForgeSession))]);
}
