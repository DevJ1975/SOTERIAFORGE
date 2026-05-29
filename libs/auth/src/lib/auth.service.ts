import { Injectable, computed, inject, signal } from '@angular/core';
import { Auth, authState, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import type { CustomClaims, Principal } from '@forge/shared';
import { toSignal } from '@angular/core/rxjs-interop';
import { parseClaims } from './claims';
import { TenantService } from './tenant.service';

/**
 * Authentication facade over Firebase Auth + GCIP multi-tenancy.
 *
 * GCIP isolation: before any sign-in we stamp `auth.tenantId` with the active
 * tenant's Identity Platform id so the user authenticates against that tenant's
 * pool. Superadmin signs in against the project-level (tenantId = null) pool.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly tenant = inject(TenantService);

  /** The raw Firebase user (null when signed out). */
  private readonly firebaseUser = toSignal(user(this.auth), { initialValue: null });

  /** Validated custom claims, refreshed on auth state changes. */
  private readonly _claims = signal<CustomClaims | null>(null);
  readonly claims = this._claims.asReadonly();

  readonly isAuthenticated = computed(() => !!this.firebaseUser());

  readonly principal = computed<Principal | null>(() => {
    const u = this.firebaseUser();
    const claims = this._claims();
    if (!u || !claims) return null;
    return {
      uid: u.uid,
      email: u.email ?? undefined,
      displayName: u.displayName ?? undefined,
      claims,
    };
  });

  /** Bind the active GCIP tenant onto the Auth instance. */
  applyTenantScope(): void {
    this.auth.tenantId = this.tenant.gcipTenantId();
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    this.applyTenantScope();
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    await this.refreshClaims();
    if (cred.user && !this._claims()) {
      // No claims yet (e.g. just-provisioned user) — force a token refresh once.
      await cred.user.getIdToken(true);
      await this.refreshClaims();
    }
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
    this._claims.set(null);
  }

  /** Force-refresh the ID token and re-parse custom claims. */
  async refreshClaims(forceRefresh = false): Promise<CustomClaims | null> {
    const u = this.auth.currentUser;
    if (!u) {
      this._claims.set(null);
      return null;
    }
    const token = await u.getIdTokenResult(forceRefresh);
    const claims = parseClaims(token.claims);
    this._claims.set(claims);
    return claims;
  }

  /** Observable of auth state for guards that prefer async resolution. */
  authState$() {
    return authState(this.auth);
  }
}
