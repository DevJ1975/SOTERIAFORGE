import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
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
 * Standard Firebase wiring for the Angular apps: App + Auth + Firestore +
 * Functions + App Check. App Check is required on Firestore/Functions/Storage
 * in prod. Functions is wired centrally so every app's callable services
 * (quiz submit, tenant admin, ingest, tutor, checkout) resolve `Functions`.
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
