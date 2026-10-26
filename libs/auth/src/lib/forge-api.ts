import {
  type EnvironmentProviders,
  Injectable,
  computed,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from '@angular/core';
import { type HttpInterceptorFn, httpResource } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
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
}

/** Starts the API session with the app. Pair with `withInterceptors([forgeApiInterceptor])`. */
export function provideForgeApi(): EnvironmentProviders {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => inject(ForgeSession))]);
}
