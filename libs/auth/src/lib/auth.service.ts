import { Injectable, InjectionToken, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { CustomClaims, Principal } from '@assurance/shared';
import { ASSURANCE_ENV } from './assurance-environment';
import { type ForgeMe, forgeApiUrl } from './forge-me';
import { TenantService } from './tenant.service';

/**
 * App-owned offline IndexedDB databases (none are uid-scoped). On a shared
 * device these would otherwise let the next user read the previous user's queued
 * statements / attempts / completions / downloads, so they are deleted on
 * sign-out. Kept in sync with each offline feature's `DB_NAME`.
 */
const OFFLINE_IDB_DATABASES = [
  'assurance.xapi-queue',
  'assurance.quiz-outbox',
  'assurance.quiz-drafts',
  'assurance.completion-outbox',
  'assurance.downloads',
] as const;

/** Cache Storage bucket used for downloaded offline content (see `download.service`). */
const OFFLINE_CACHE_NAME = 'assurance-offline-v1';

/**
 * Extra clean-up to run on sign-out (multi-provider). The data layer registers one
 * to wipe its own on-device cache; kept as a token so auth never imports it.
 */
export const SIGN_OUT_CLEANUP = new InjectionToken<(() => Promise<void>)[]>('SIGN_OUT_CLEANUP');

/** Refresh the access token this long before it expires. */
const EXPIRY_MARGIN_MS = 30_000;

/**
 * A sign-in failure. `code` reuses the `auth/...` vocabulary that
 * `authErrorMessageKey` maps to translated messages.
 */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface TokenResponse {
  access: string;
  expiresIn: number;
}

/**
 * Sign-in against the Forge API (Django): email + password, a short-lived access
 * token held in memory, and a refresh token the API keeps in an HttpOnly cookie
 * (so page scripts never see it). Role and tenant come from `GET /api/me`.
 *
 * Auth calls use `fetch` directly rather than HttpClient, so they don't loop
 * through `forgeApiInterceptor` (which asks this service for the token).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly env = inject(ASSURANCE_ENV);
  private readonly tenant = inject(TenantService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cleanups = inject(SIGN_OUT_CLEANUP, { optional: true }) ?? [];

  private access: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string | null> | null = null;
  /** Set after a refresh fails, so signed-out pages don't retry on every API call. */
  private signedOut = false;

  private readonly meState = signal<ForgeMe | null>(null);
  /** HTTP status of the last `/api/me` load: 401/403 mean the API refused. */
  private readonly meStatusState = signal<number | null>(null);

  /** The membership `/api/me` returned, or null when signed out. */
  readonly me = this.meState.asReadonly();
  readonly meStatus = this.meStatusState.asReadonly();

  /** Role and tenant from Postgres, shaped like the claims the guards check. */
  readonly claims = computed<CustomClaims | null>(() => {
    const me = this.meState();
    if (!me) return null;
    return {
      role: me.member.role,
      tenantId: me.tenant?.id ?? me.member.tenantId ?? undefined,
      entitlements: [],
    };
  });

  readonly isAuthenticated = computed(() => !!this.meState());

  /** Stable id of the signed-in member (null when signed out). */
  readonly uid = computed(() => this.meState()?.member.uid ?? null);

  readonly principal = computed<Principal | null>(() => {
    const me = this.meState();
    const claims = this.claims();
    if (!me || !claims) return null;
    return {
      uid: me.member.uid,
      email: me.member.email,
      displayName: me.member.displayName || undefined,
      claims,
    };
  });

  /** Resolves once the session from a previous visit has been restored (or not). */
  private readonly restored: Promise<void> = this.isBrowser ? this.restore() : Promise.resolve();

  /** Waits for the initial session restore. */
  ready(): Promise<void> {
    return this.restored;
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const res = await this.call('/api/auth/login', {
      email,
      password,
      tenant: this.tenant.tenantId() ?? '',
    });
    if (!res.ok) throw await this.failure(res, 'auth/invalid-credential');
    this.store((await res.json()) as TokenResponse);
    await this.loadMe();
    if (!this.meState()) throw new AuthError('auth/user-disabled', 'Not allowed in', 403);
  }

  /** Self-service sign-up isn't offered; members are invited. */
  async signUp(_email: string, _password: string, _displayName?: string): Promise<void> {
    throw new AuthError('auth/operation-not-allowed', 'Sign-up is not available.');
  }

  /** Emails a reset link. The API answers the same whether or not the account exists. */
  async sendPasswordResetEmail(email: string): Promise<void> {
    const res = await this.call('/api/auth/password-reset', {
      email,
      tenant: this.tenant.tenantId() ?? '',
    });
    if (!res.ok) throw await this.failure(res, 'auth/internal-error');
  }

  /** Sets a password from an emailed reset or invite link. */
  async confirmPasswordReset(token: string, password: string): Promise<void> {
    const res = await this.call('/api/auth/password-reset/confirm', { token, password });
    if (res.ok) return;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 400 && body['password']) {
      throw new AuthError(
        'auth/weak-password',
        ([] as string[]).concat(body['password'] as string[]).join(' '),
        400,
      );
    }
    if (res.status === 400 && body['token']) {
      throw new AuthError('auth/invalid-action-code', 'This link is invalid or has expired.', 400);
    }
    throw await this.failure(res, 'auth/internal-error');
  }

  async signOutUser(): Promise<void> {
    try {
      if (this.isBrowser && this.env.apiBaseUrl) await this.call('/api/auth/logout', {});
    } catch {
      // Offline: the local session still ends below.
    }
    this.clearSession();
    // Shared-device hygiene: purge this user's local offline data so the next
    // user cannot read it. Best-effort and never throws (FIX-10).
    await this.clearLocalOfflineData();
  }

  /**
   * A current access token for the Forge API, refreshing it if it's about to
   * expire. Null when signed out.
   */
  async getAccessToken(): Promise<string | null> {
    if (this.access && this.access.expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
      return this.access.token;
    }
    if (this.signedOut || !this.isBrowser || !this.env.apiBaseUrl) return null;
    return this.refreshAccess();
  }

  /** Forces a new access token (after the API rejected one). Null when signed out. */
  async renewAccessToken(): Promise<string | null> {
    this.access = null;
    return this.signedOut ? null : this.refreshAccess();
  }

  /** The current role/tenant, after the initial restore; `force` reloads `/api/me`. */
  async refreshClaims(force = false): Promise<CustomClaims | null> {
    await this.restored;
    if (force && this.access) await this.loadMe();
    return this.claims();
  }

  /**
   * Best-effort deletion of all app-owned offline local data on sign-out: the
   * offline IndexedDB databases, the offline Cache Storage bucket, and anything
   * registered under `SIGN_OUT_CLEANUP` (e.g. a feature-owned cache). None of
   * these are uid-scoped, so on a shared device they would leak the prior
   * user's data. Browser-guarded and fully swallowed: this MUST NOT break
   * sign-out if any step fails or is unsupported.
   */
  async clearLocalOfflineData(): Promise<void> {
    if (typeof window === 'undefined') return;

    for (const cleanup of this.cleanups) {
      try {
        await cleanup();
      } catch {
        // Already terminated / unsupported / open elsewhere — ignore.
      }
    }

    if (typeof indexedDB !== 'undefined') {
      await Promise.all(
        OFFLINE_IDB_DATABASES.map(
          (name) =>
            new Promise<void>((resolve) => {
              try {
                const req = indexedDB.deleteDatabase(name);
                // Resolve on every terminal outcome (incl. `blocked`) — never reject.
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              } catch {
                resolve();
              }
            }),
        ),
      );
    }

    if (typeof caches !== 'undefined') {
      try {
        await caches.delete(OFFLINE_CACHE_NAME);
      } catch {
        // Cache Storage unsupported / blocked — ignore.
      }
    }
  }

  // --- internals ---------------------------------------------------------------
  private async restore(): Promise<void> {
    if (!this.env.apiBaseUrl) return;
    if (await this.refreshAccess()) await this.loadMe();
  }

  private refreshAccess(): Promise<string | null> {
    // One refresh at a time: concurrent callers share it (the API rotates the
    // cookie on every use, so parallel refreshes would trip reuse detection).
    this.refreshing ??= (async () => {
      try {
        const res = await this.call('/api/auth/refresh', {});
        if (!res.ok) {
          this.clearSession();
          return null;
        }
        return this.store((await res.json()) as TokenResponse);
      } catch {
        return null; // offline: keep whatever session state we have
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async loadMe(): Promise<void> {
    const token = this.access?.token;
    if (!token || !this.env.apiBaseUrl) return;
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const tenantId = this.tenant.tenantId();
    if (tenantId) headers['X-Forge-Tenant'] = tenantId;
    try {
      const res = await fetch(forgeApiUrl(this.env.apiBaseUrl, '/api/me'), { headers });
      this.meStatusState.set(res.status);
      this.meState.set(res.ok ? ((await res.json()) as ForgeMe) : null);
    } catch {
      this.meStatusState.set(0); // network error: API unavailable
    }
  }

  private store(body: TokenResponse): string {
    this.access = { token: body.access, expiresAt: Date.now() + body.expiresIn * 1000 };
    this.signedOut = false;
    return body.access;
  }

  private clearSession(): void {
    this.access = null;
    this.signedOut = true;
    this.meState.set(null);
    this.meStatusState.set(null);
  }

  /** POST JSON to an auth endpoint, sending and receiving the refresh cookie. */
  private async call(path: string, body: object): Promise<Response> {
    if (!this.env.apiBaseUrl) throw new AuthError('auth/unavailable', 'No API configured.');
    try {
      return await fetch(forgeApiUrl(this.env.apiBaseUrl, path), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Forge-Client': 'web' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthError('auth/network-request-failed', 'Network error.');
    }
  }

  private async failure(res: Response, fallback: string): Promise<AuthError> {
    if (res.status === 429)
      return new AuthError('auth/too-many-requests', 'Too many attempts.', 429);
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    const code = res.status === 401 ? 'auth/invalid-credential' : fallback;
    return new AuthError(code, body.detail ?? code, res.status);
  }
}
