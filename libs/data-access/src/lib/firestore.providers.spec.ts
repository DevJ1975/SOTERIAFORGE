/**
 * Unit tests for the Firestore provider factory (MO-01).
 *
 * We cannot bootstrap the real `@angular/fire` providers under jsdom (the
 * partially-compiled AngularFire injectables need the JIT compiler), so we mock
 * `@angular/fire/firestore` and exercise the platform-branching factory
 * directly via the `__buildFirestoreForTest` export.
 *
 * The key assertion: in the browser the factory configures an IndexedDB-backed
 * `persistentLocalCache` (with the multi-tab manager); on the server it falls
 * back to the default `getFirestore()` so prerender never touches IndexedDB.
 */

const initializeFirestore = jest.fn(
  (_app: unknown, _settings: { localCache?: unknown }) => ({ __kind: 'persistent' }) as unknown,
);
const getFirestore = jest.fn(() => ({ __kind: 'default' }) as unknown);
const persistentLocalCache = jest.fn((cfg: unknown) => ({ __cache: 'persistent', cfg }) as unknown);
const persistentMultipleTabManager = jest.fn(() => ({ __tab: 'multi' }) as unknown);

jest.mock('@angular/fire/firestore', () => ({
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator: jest.fn(),
  provideFirestore: jest.fn(),
}));

jest.mock('@angular/fire/app', () => ({
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
  initializeApp: jest.fn(),
  provideFirebaseApp: jest.fn(),
}));

jest.mock('@angular/fire/auth', () => ({ getAuth: jest.fn(), provideAuth: jest.fn() }));
jest.mock('@angular/fire/functions', () => ({
  getFunctions: jest.fn(),
  provideFunctions: jest.fn(),
  connectFunctionsEmulator: jest.fn(),
}));
jest.mock('@angular/fire/app-check', () => ({
  ReCaptchaEnterpriseProvider: class {},
  initializeAppCheck: jest.fn(),
  provideAppCheck: jest.fn(),
}));

import { __buildFirestoreForTest } from './firestore.providers';

describe('provideForgeFirebase / buildFirestore (MO-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('configures a persistent IndexedDB cache with the multi-tab manager in the browser', () => {
    const fs = __buildFirestoreForTest(true);

    expect(initializeFirestore).toHaveBeenCalledTimes(1);
    expect(persistentLocalCache).toHaveBeenCalledTimes(1);
    expect(persistentMultipleTabManager).toHaveBeenCalledTimes(1);

    // The localCache option passed to initializeFirestore must be the
    // persistentLocalCache result (so the IndexedDB cache is actually wired).
    const optionsArg = initializeFirestore.mock.calls[0][1];
    expect(optionsArg.localCache).toBe(persistentLocalCache.mock.results[0].value);

    // getFirestore must NOT be used as the primary path in the browser.
    expect(getFirestore).not.toHaveBeenCalled();
    expect(fs).toEqual({ __kind: 'persistent' });
  });

  it('uses the default in-memory Firestore on the server (no IndexedDB)', () => {
    const fs = __buildFirestoreForTest(false);

    expect(getFirestore).toHaveBeenCalledTimes(1);
    expect(initializeFirestore).not.toHaveBeenCalled();
    expect(persistentLocalCache).not.toHaveBeenCalled();
    expect(fs).toEqual({ __kind: 'default' });
  });

  it('falls back to the existing instance if Firestore was already initialized', () => {
    initializeFirestore.mockImplementationOnce(() => {
      throw new Error('already initialized');
    });

    const fs = __buildFirestoreForTest(true);

    expect(initializeFirestore).toHaveBeenCalledTimes(1);
    expect(getFirestore).toHaveBeenCalledTimes(1);
    expect(fs).toEqual({ __kind: 'default' });
  });
});
