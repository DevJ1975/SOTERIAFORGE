import { computed, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from '@angular/fire/auth';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  AUTHORING_ROLES,
  CustomClaims,
  deviceId,
  emit,
  Role,
  staggerDelayMs,
  withRetry,
} from '@forge/shared';
import { parseClaims } from './claims';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

/**
 * Window (ms) over which devices spread their sign-in attempt. At a shift change
 * the whole fleet would otherwise hit Firebase Auth simultaneously; staggering
 * by {@link deviceId} fans those attempts out across the window.
 */
const LOGIN_WINDOW_MS = 10_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface PrincipalState {
  status: AuthStatus;
  uid: string | null;
  email: string | null;
  displayName: string | null;
  claims: CustomClaims | null;
}

const initialState: PrincipalState = {
  status: 'loading',
  uid: null,
  email: null,
  displayName: null,
  claims: null,
};

/**
 * Root store holding the authenticated principal: Firebase user identity plus
 * parsed custom claims (role / tenant scope, set by Cloud Functions).
 *
 * `Auth` is injected optionally so the store can be constructed in tests (or
 * apps) without Firebase providers — every method degrades to a no-op or a
 * 'signedOut' state in that case.
 */
export const PrincipalStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ claims }) => ({
    role: computed<Role | null>(() => claims()?.role ?? null),
    tenantId: computed<string | null>(() => claims()?.tenantId ?? null),
    isSuperadmin: computed(() => claims()?.role === 'superadmin'),
    canAuthor: computed(() => {
      const role = claims()?.role;
      return !!role && AUTHORING_ROLES.includes(role);
    }),
  })),
  withMethods((store) => {
    const auth = inject(Auth, { optional: true });
    let initialized = false;

    async function applyUser(user: User | null): Promise<void> {
      if (!user) {
        patchState(store, { ...initialState, status: 'signedOut' });
        return;
      }
      let claims: CustomClaims | null = null;
      try {
        const result = await user.getIdTokenResult();
        claims = parseClaims(result.claims);
      } catch {
        claims = null; // signed in but unprivileged
      }
      patchState(store, {
        status: 'signedIn',
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        claims,
      });
    }

    function requireAuth(): Auth {
      if (!auth) throw new Error('Firebase Auth is not available (provideForgeFirebase missing).');
      return auth;
    }

    return {
      /** Starts watching the Firebase session. Idempotent. */
      init(): void {
        if (initialized) return;
        initialized = true;
        if (!auth) {
          // No Firebase providers (tests, SSR shells): settle as signed out.
          patchState(store, { ...initialState, status: 'signedOut' });
          return;
        }
        onIdTokenChanged(auth, (user) => void applyUser(user));
      },

      /** Forces a token refresh and re-parses claims (e.g. after a role grant). */
      async refreshClaims(): Promise<void> {
        const user = auth?.currentUser;
        if (!user) return;
        const result = await user.getIdTokenResult(true);
        patchState(store, { claims: parseClaims(result.claims) });
      },

      async signIn(email: string, password: string): Promise<void> {
        const auth = requireAuth();
        // Stagger the attempt so a shift-change burst fans out across the window
        // instead of arriving at Firebase Auth together.
        await sleep(staggerDelayMs(deviceId(), LOGIN_WINDOW_MS));
        let attempt = 0;
        emit('login_attempt');
        await withRetry(() => {
          if (attempt > 0) {
            emit('login_retry', { attempt });
          }
          attempt++;
          return signInWithEmailAndPassword(auth, email, password);
        });
      },

      /** Emulator/dev convenience: create an email/password test account. */
      async signUp(email: string, password: string): Promise<void> {
        await createUserWithEmailAndPassword(requireAuth(), email, password);
      },

      async signOutUser(): Promise<void> {
        if (!auth) return;
        await signOut(auth);
      },
    };
  }),
);
