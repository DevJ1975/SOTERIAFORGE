import {
  type EnvironmentProviders,
  PLATFORM_ID,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  type Firestore,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore,
} from '@angular/fire/firestore';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
  provideAppCheck,
} from '@angular/fire/app-check';

export interface FirebaseProvidersOptions {
  firebase: Record<string, string>;
  appCheckSiteKey?: string;
  useEmulators?: boolean;
}

/**
 * Build the `Firestore` instance for the current platform.
 *
 * Browser: enable IndexedDB-backed offline persistence via
 * `persistentLocalCache` with the multiple-tab manager so the cache is shared
 * across the admin/learner tabs without the legacy single-tab lock. This makes
 * every dynamic screen survive a cold offline load (MO-01).
 *
 * Server (SSR / prerender): persistence relies on IndexedDB, which does not
 * exist on the server and would throw during storefront prerender. So on the
 * server we use the default in-memory Firestore (`getFirestore()`), which never
 * touches IndexedDB.
 *
 * `initializeFirestore` must be called before any other Firestore access on the
 * app, so it is invoked inside the `provideFirestore` factory (the first place
 * Firestore is resolved).
 */
function buildFirestore(isBrowser: boolean): Firestore {
  if (isBrowser) {
    try {
      return initializeFirestore(getApp(), {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      // initializeFirestore throws if Firestore was already initialized for this
      // app (e.g. HMR / double-bootstrap). Fall back to the existing instance.
      return getFirestore();
    }
  }
  // Server / non-browser: default instance, no IndexedDB.
  return getFirestore();
}

/**
 * Standard Firebase wiring for the Angular apps: App + Auth + Firestore +
 * Functions + App Check. App Check is required on Firestore/Functions/Storage
 * in prod. Functions is wired centrally so every app's callable services
 * (quiz submit, tenant admin, ingest, tutor, checkout) resolve `Functions`.
 *
 * Firestore offline persistence (IndexedDB) is enabled in the browser only;
 * see {@link buildFirestore}.
 */
export function provideForgeFirebase(options: FirebaseProvidersOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideFirebaseApp(() => initializeApp(options.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => {
      const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
      const fs = buildFirestore(isBrowser);
      if (options.useEmulators) {
        connectFirestoreEmulator(fs, '127.0.0.1', 8080);
      }
      return fs;
    }),
    provideFunctions(() => {
      const fns = getFunctions();
      if (options.useEmulators) {
        connectFunctionsEmulator(fns, '127.0.0.1', 5001);
      }
      return fns;
    }),
    ...(options.appCheckSiteKey
      ? [
          provideAppCheck(() =>
            initializeAppCheck(getApp(), {
              provider: new ReCaptchaEnterpriseProvider(options.appCheckSiteKey as string),
              isTokenAutoRefreshEnabled: true,
            }),
          ),
        ]
      : []),
  ]);
}

/**
 * Exposed for unit testing: constructs the platform-appropriate Firestore
 * instance (browser → persistent IndexedDB cache; server → default/memory).
 * Production code uses {@link provideForgeFirebase}.
 *
 * @internal
 */
export const __buildFirestoreForTest = buildFirestore;
