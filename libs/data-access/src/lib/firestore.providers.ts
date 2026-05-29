import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
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
 * Standard Firebase wiring for the Angular apps: App + Auth + Firestore +
 * App Check. App Check is required on Firestore/Functions/Storage in prod.
 */
export function provideForgeFirebase(options: FirebaseProvidersOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideFirebaseApp(() => initializeApp(options.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => {
      const fs = getFirestore();
      if (options.useEmulators) {
        connectFirestoreEmulator(fs, '127.0.0.1', 8080);
      }
      return fs;
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
