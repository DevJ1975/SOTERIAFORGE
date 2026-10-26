jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(() => () => undefined),
  onIdTokenChanged: jest.fn(() => () => undefined),
}));

import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ASSURANCE_ENV, type AssuranceEnvironment } from './assurance-environment';
import { AuthService } from './auth.service';
import { FIREBASE_AUTH } from './firebase-auth';
import { type ForgeMe, ForgeSession, forgeApiInterceptor, forgeApiUrl } from './forge-api';
import { TenantService } from './tenant.service';

const env: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'http://api.test/',
  firebase: {
    apiKey: 'x',
    authDomain: 'x',
    projectId: 'x',
    storageBucket: 'x',
    messagingSenderId: 'x',
    appId: 'x',
  },
};

const me: ForgeMe = {
  member: {
    id: 'm1',
    uid: 'marcus',
    tenantId: 'lakewood',
    email: 'marcus@example.com',
    displayName: 'Marcus Walker',
    role: 'learner',
    status: 'active',
  },
  tenant: { id: 'lakewood', name: 'Lakewood University', status: 'active', branding: {} },
  canAuthor: false,
};

const uid = signal<string | null>(null);
let currentUser: { getIdToken: () => Promise<string> } | null;
let tenantId: string | null;

function setup(apiBaseUrl: string | undefined = env.apiBaseUrl) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([forgeApiInterceptor])),
      provideHttpClientTesting(),
      { provide: ASSURANCE_ENV, useValue: { ...env, apiBaseUrl } },
      {
        provide: FIREBASE_AUTH,
        useValue: {
          get currentUser() {
            return currentUser;
          },
        },
      },
      { provide: TenantService, useValue: { tenantId: () => tenantId } },
      { provide: AuthService, useValue: { uid } },
    ],
  });
  return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController) };
}

/** Lets the interceptor's async getIdToken() resolve before asserting on requests. */
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

describe('forgeApiInterceptor', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    currentUser = { getIdToken: async () => 'id-token' };
    tenantId = 'lakewood';
    uid.set(null);
  });

  it('joins URLs without doubling slashes', () => {
    expect(forgeApiUrl('http://api.test/', '/api/me')).toBe('http://api.test/api/me');
  });

  it('adds the ID token and tenant to API requests', async () => {
    const { http, ctrl } = setup();
    const done = firstValueFrom(http.get('http://api.test/api/me'));
    await flushMicrotasks();
    const req = ctrl.expectOne('http://api.test/api/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer id-token');
    expect(req.request.headers.get('X-Forge-Tenant')).toBe('lakewood');
    req.flush({});
    await done;
  });

  it('never sends the token anywhere else', async () => {
    const { http, ctrl } = setup();
    const done = firstValueFrom(http.get('http://api.test.evil.example/steal'));
    await flushMicrotasks();
    const req = ctrl.expectOne('http://api.test.evil.example/steal');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.has('X-Forge-Tenant')).toBe(false);
    req.flush({});
    await done;
  });

  it('sends anonymous API requests without an Authorization header', async () => {
    currentUser = null;
    tenantId = null;
    const { http, ctrl } = setup();
    const done = firstValueFrom(http.get('http://api.test/healthz'));
    await flushMicrotasks();
    const req = ctrl.expectOne('http://api.test/healthz');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    await done;
  });
});

describe('ForgeSession', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    currentUser = { getIdToken: async () => 'id-token' };
    tenantId = 'lakewood';
    uid.set(null);
  });

  const settle = async () => {
    TestBed.inject(ApplicationRef).tick();
    await flushMicrotasks();
  };

  it('loads /api/me after sign-in and clears on sign-out', async () => {
    const { ctrl } = setup();
    const session = TestBed.inject(ForgeSession);
    await settle();
    ctrl.expectNone('http://api.test/api/me');

    uid.set('marcus');
    await settle();
    ctrl.expectOne('http://api.test/api/me').flush(me);
    await settle();
    expect(session.role()).toBe('learner');
    expect(session.canAuthor()).toBe(false);

    uid.set(null);
    await settle();
    expect(session.role()).toBeNull();
  });

  it('refetches when a different user signs in on the same tab', async () => {
    const { ctrl } = setup();
    TestBed.inject(ForgeSession);
    uid.set('marcus');
    await settle();
    ctrl.expectOne('http://api.test/api/me').flush(me);
    uid.set('jamil');
    await settle();
    ctrl.expectOne('http://api.test/api/me').flush({ ...me, canAuthor: true });
  });

  it('stays idle when no API is configured', async () => {
    const { ctrl } = setup('');
    TestBed.inject(ForgeSession);
    uid.set('marcus');
    await settle();
    ctrl.verify();
  });
});
