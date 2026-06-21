import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Auth,
  authState,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  user,
} from '@angular/fire/auth';
import { Firestore, clearIndexedDbPersistence, terminate } from '@angular/fire/firestore';
import type { CustomClaims, Principal } from '@assurance/shared';
import { toSignal } from '@angular/core/rxjs-interop';
import { parseClaims } from './claims';
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
  /** Optional: not every AuthService consumer provides Firestore. */
  private readonly firestore = inject(Firestore, { optional: true });

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

  async signUp(email: string, password: string, displayName?: string): Promise<void> {
    this.applyTenantScope();
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    if (displayName && cred.user) {
      await updateProfile(cred.user, { displayName });
    }
    await this.refreshClaims();
    if (cred.user && !this._claims()) {
      // No claims yet for a just-provisioned user — force a token refresh once.
      await cred.user.getIdToken(true);
      await this.refreshClaims();
    }
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
    this._claims.set(null);
    // Shared-device hygiene: purge this user's local offline data so the next
    // user cannot read it. Best-effort and never throws — sign-out must succeed
    // regardless (FIX-10).
    await this.clearLocalOfflineData();
  }

  /**
   * Best-effort deletion of all app-owned offline local data on sign-out:
   * the offline IndexedDB databases, the offline Cache Storage bucket, and the
   * Firestore SDK's IndexedDB cache (MO-01 `persistentLocalCache`). None of
   * these are uid-scoped, so on a shared device they would leak the prior
   * user's data. Browser-guarded and fully swallowed — this MUST NOT break
   * sign-out if any step fails or is unsupported.
   *
   * Caveat: deleting an IndexedDB database that still has open connections in
   * other tabs may be `blocked` until they close; for the Firestore cache we
   * `terminate()` first, but a hard reload after sign-out remains the most
   * reliable way to guarantee a clean slate on shared devices.
   */
  async clearLocalOfflineData(): Promise<void> {
    if (typeof window === 'undefined') return;

    // 1. Firestore SDK persistent cache: terminate the client, then clear it.
    if (this.firestore) {
      try {
        await terminate(this.firestore);
        await clearIndexedDbPersistence(this.firestore);
      } catch {
        // Already terminated / unsupported / open elsewhere — ignore.
      }
    }

    // 2. App-owned offline IndexedDB databases.
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

    // 3. Offline Cache Storage bucket (downloaded content).
    if (typeof caches !== 'undefined') {
      try {
        await caches.delete(OFFLINE_CACHE_NAME);
      } catch {
        // Cache Storage unsupported / blocked — ignore.
      }
    }
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
