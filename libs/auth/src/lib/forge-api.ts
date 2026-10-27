import {
  type EnvironmentProviders,
  Injectable,
  computed,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn, httpResource } from '@angular/common/http';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, from, switchMap } from 'rxjs';
import type { Role } from '@assurance/shared';
import { ASSURANCE_ENV } from './assurance-environment';
import { AuthService } from './auth.service';
import { FIREBASE_AUTH } from './firebase-auth';
import { TenantService } from './tenant.service';

/** `GET /api/me` from the Forge API (backend/apps/accounts/serializers.py). */
export interface ForgeMe {
  member: {
    id: string;
    uid: string;
    tenantId: string | null;
    email: string;
    displayName: string;
    role: Role;
    status: 'invited' | 'active' | 'deactivated';
  };
  tenant: { id: string; name: string; status: string; branding: Record<string, unknown> } | null;
  canAuthor: boolean;
}

/**
 * What the API says about the signed-in user, for route guards:
 * - `member`: use this membership (Postgres is the source of truth for roles)
 * - `denied`: the API refused (401/403: not a member, deactivated, wrong tenant)
 * - `unavailable`: no API configured, nobody signed in, or the API is down;
 *   guards fall back to Firebase claims
 */
export type ForgeAccess =
  | { kind: 'member'; me: ForgeMe }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

/** Joins the configured API base URL and a path (`/api/me`). */
export function forgeApiUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Sends the Firebase ID token and the host-resolved tenant to the Forge API, and
 * only to it: requests elsewhere never carry the token.
 */
export const forgeApiInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(ASSURANCE_ENV).apiBaseUrl;
  if (!base || !req.url.startsWith(forgeApiUrl(base, ''))) return next(req);

  const user = inject(FIREBASE_AUTH)?.currentUser;
  const tenantId = inject(TenantService).tenantId();
  return from(user ? user.getIdToken() : Promise.resolve(null)).pipe(
    switchMap((token) => {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (tenantId) headers['X-Forge-Tenant'] = tenantId;
      return next(req.clone({ setHeaders: headers }));
    }),
  );
};

/**
 * The signed-in user as the Forge API sees them (membership, role, tenant).
 * Postgres is the source of truth for roles (docs/forge-platform-plan.md §2);
 * route guards still read Firebase claims until they move onto this.
 */
@Injectable({ providedIn: 'root' })
export class ForgeSession {
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;
  private readonly auth = inject(AuthService);

  /**
   * Loads after sign-in, clears on sign-out; idle when no API is configured.
   * A fresh request object per uid makes a user switch in the same tab refetch.
   */
  readonly me = httpResource<ForgeMe>(() => {
    const uid = this.auth.uid();
    return this.base && uid ? { url: forgeApiUrl(this.base, '/api/me') } : undefined;
  });

  readonly role = computed<Role | null>(() =>
    this.me.hasValue() ? this.me.value().member.role : null,
  );
  readonly canAuthor = computed(() => (this.me.hasValue() ? this.me.value().canAuthor : false));

  private readonly status$ = toObservable(this.me.status);

  /** Waits for any in-flight `/api/me` load, then classifies the result. */
  async settled(): Promise<ForgeAccess> {
    if (!this.base || !this.auth.uid()) return { kind: 'unavailable' };
    await firstValueFrom(this.status$.pipe(filter((s) => s !== 'loading' && s !== 'reloading')));
    if (this.me.hasValue()) return { kind: 'member', me: this.me.value() };
    const err = this.me.error();
    if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
      return { kind: 'denied' };
    }
    return { kind: 'unavailable' };
  }
}

/** Starts the API session with the app. Pair with `withInterceptors([forgeApiInterceptor])`. */
export function provideForgeApi(): EnvironmentProviders {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => inject(ForgeSession))]);
}
