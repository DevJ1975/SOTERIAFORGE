/**
 * Tests for sign-out local-data hygiene (FIX-10): `clearLocalOfflineData`
 * best-effort deletes the app's offline IndexedDB databases + Cache Storage and
 * clears the Firestore SDK cache, and NEVER throws so sign-out always succeeds.
 *
 * `@angular/fire/auth` and `@angular/fire/firestore` are mocked so the service
 * can be constructed under jsdom without bootstrapping AngularFire, and so we
 * can assert the Firestore terminate/clear calls.
 */
import { of } from 'rxjs';

const signOut = jest.fn().mockResolvedValue(undefined);
jest.mock('@angular/fire/auth', () => ({
  Auth: class Auth {},
  authState: jest.fn(() => of(null)),
  user: jest.fn(() => of(null)),
  signOut,
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  updateProfile: jest.fn(),
}));

const terminate = jest.fn().mockResolvedValue(undefined);
const clearIndexedDbPersistence = jest.fn().mockResolvedValue(undefined);
jest.mock('@angular/fire/firestore', () => ({
  Firestore: class Firestore {},
  terminate,
  clearIndexedDbPersistence,
}));

import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { ASSURANCE_ENV, type AssuranceEnvironment } from './assurance-environment';

const testEnv: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

const EXPECTED_DBS = [
  'assurance.xapi-queue',
  'assurance.quiz-outbox',
  'assurance.quiz-drafts',
  'assurance.completion-outbox',
  'assurance.downloads',
];

interface FakeDeleteRequest {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onblocked: (() => void) | null;
}

function installFakeIdbAndCaches(): { deleted: string[]; cachesDeleted: string[] } {
  const deleted: string[] = [];
  const cachesDeleted: string[] = [];

  const reqs: FakeDeleteRequest[] = [];
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    deleteDatabase: (name: string) => {
      deleted.push(name);
      const req: FakeDeleteRequest = { onsuccess: null, onerror: null, onblocked: null };
      reqs.push(req);
      // Fire success asynchronously, mirroring the real async request.
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
  };

  (globalThis as unknown as { caches: unknown }).caches = {
    delete: (name: string) => {
      cachesDeleted.push(name);
      return Promise.resolve(true);
    },
  };

  return { deleted, cachesDeleted };
}

function setup(withFirestore: boolean): AuthService {
  TestBed.configureTestingModule({
    providers: [
      AuthService,
      { provide: Auth, useValue: { currentUser: null, tenantId: null } },
      { provide: ASSURANCE_ENV, useValue: testEnv },
      { provide: DOCUMENT, useValue: document },
      ...(withFirestore ? [{ provide: Firestore, useValue: { __fake: true } }] : []),
    ],
  });
  return TestBed.inject(AuthService);
}

describe('AuthService.clearLocalOfflineData (FIX-10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    delete (globalThis as unknown as { caches?: unknown }).caches;
  });

  it('deletes all five offline IndexedDB databases and the offline cache', async () => {
    const { deleted, cachesDeleted } = installFakeIdbAndCaches();
    const svc = setup(true);

    await svc.clearLocalOfflineData();

    expect(deleted.sort()).toEqual([...EXPECTED_DBS].sort());
    expect(cachesDeleted).toEqual(['assurance-offline-v1']);
  });

  it('terminates and clears the Firestore SDK cache when Firestore is provided', async () => {
    installFakeIdbAndCaches();
    const svc = setup(true);

    await svc.clearLocalOfflineData();

    expect(terminate).toHaveBeenCalledTimes(1);
    expect(clearIndexedDbPersistence).toHaveBeenCalledTimes(1);
  });

  it('skips Firestore steps when Firestore is not provided (optional inject)', async () => {
    installFakeIdbAndCaches();
    const svc = setup(false);

    await svc.clearLocalOfflineData();

    expect(terminate).not.toHaveBeenCalled();
    expect(clearIndexedDbPersistence).not.toHaveBeenCalled();
  });

  it('never throws even when every sub-step rejects (sign-out must not break)', async () => {
    terminate.mockRejectedValueOnce(new Error('already terminated'));
    clearIndexedDbPersistence.mockRejectedValueOnce(new Error('open elsewhere'));
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
      deleteDatabase: () => {
        throw new Error('boom');
      },
    };
    (globalThis as unknown as { caches: unknown }).caches = {
      delete: () => Promise.reject(new Error('nope')),
    };
    const svc = setup(true);

    await expect(svc.clearLocalOfflineData()).resolves.toBeUndefined();
  });

  it('signOutUser clears claims and runs the offline-data purge', async () => {
    const { deleted } = installFakeIdbAndCaches();
    const svc = setup(true);

    await svc.signOutUser();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(deleted.sort()).toEqual([...EXPECTED_DBS].sort());
  });
});
