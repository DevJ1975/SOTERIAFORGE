import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { FirebaseOptions, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { connectFunctionsEmulator, getFunctions, provideFunctions } from '@angular/fire/functions';
import { connectStorageEmulator, getStorage, provideStorage } from '@angular/fire/storage';

/**
 * Demo options used against the local Firebase emulators (no real project).
 * Swap in real options by passing them to {@link provideForgeFirebase}.
 */
export const DEFAULT_FIREBASE_OPTIONS: FirebaseOptions = {
  projectId: 'soteria-forge-dev',
  apiKey: 'demo-api-key',
  authDomain: 'soteria-forge-dev.firebaseapp.com',
  // Required for getStorage(): refs against the (emulated) default bucket.
  storageBucket: 'soteria-forge-dev.appspot.com',
  appId: 'demo',
};

const AUTH_EMULATOR_URL = 'http://localhost:9099';
const FIRESTORE_EMULATOR_HOST = 'localhost';
const FIRESTORE_EMULATOR_PORT = 8080;
const FUNCTIONS_EMULATOR_HOST = 'localhost';
const FUNCTIONS_EMULATOR_PORT = 5001;
const STORAGE_EMULATOR_HOST = 'localhost';
const STORAGE_EMULATOR_PORT = 9199;

/** True when the app is served from a local dev host (use the emulators). */
function isLocalHost(): boolean {
  return typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
}

// connect*Emulator throws if called twice against the same instance (e.g. HMR,
// multiple injector factories). Track connections at module scope.
let authEmulatorConnected = false;
let firestoreEmulatorConnected = false;
let functionsEmulatorConnected = false;
let storageEmulatorConnected = false;

/**
 * Composes Firebase app + Auth + Firestore + Functions + Storage providers for
 * every Forge app. On localhost the SDKs are pointed at the local emulator
 * suite (auth :9099, firestore :8080, functions :5001, storage :9199 — see
 * workspace firebase.json).
 */
export function provideForgeFirebase(options?: FirebaseOptions): EnvironmentProviders {
  const firebaseOptions = options ?? DEFAULT_FIREBASE_OPTIONS;
  return makeEnvironmentProviders([
    provideFirebaseApp(() => initializeApp(firebaseOptions)),
    provideAuth(() => {
      const auth = getAuth();
      if (isLocalHost() && !authEmulatorConnected) {
        try {
          connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
          authEmulatorConnected = true;
        } catch {
          // Already connected (e.g. hot reload) — safe to ignore.
        }
      }
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (isLocalHost() && !firestoreEmulatorConnected) {
        try {
          connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
          firestoreEmulatorConnected = true;
        } catch {
          // Already connected (e.g. hot reload) — safe to ignore.
        }
      }
      return firestore;
    }),
    provideFunctions(() => {
      const functions = getFunctions();
      if (isLocalHost() && !functionsEmulatorConnected) {
        try {
          connectFunctionsEmulator(functions, FUNCTIONS_EMULATOR_HOST, FUNCTIONS_EMULATOR_PORT);
          functionsEmulatorConnected = true;
        } catch {
          // Already connected (e.g. hot reload) — safe to ignore.
        }
      }
      return functions;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (isLocalHost() && !storageEmulatorConnected) {
        try {
          connectStorageEmulator(storage, STORAGE_EMULATOR_HOST, STORAGE_EMULATOR_PORT);
          storageEmulatorConnected = true;
        } catch {
          // Already connected (e.g. hot reload) — safe to ignore.
        }
      }
      return storage;
    }),
  ]);
}
