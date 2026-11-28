import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV, type AssuranceEnvironment } from './assurance-environment';
import { AuthError, AuthService } from './auth.service';
import type { ForgeMe } from './forge-me';
import { TenantService } from './tenant.service';

const env: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'https://api.test',
};

const ME: ForgeMe = {
  member: {
    id: 'm1',
    uid: 'm1',
    tenantId: 'acme',
    email: 'ada@example.com',
    displayName: 'Ada',
    role: 'learner',
    status: 'active',
  },
  tenant: { id: 'acme', name: 'Acme', status: 'active', branding: {} },
  canAuthor: false,
};

type Reply = { status?: number; body?: unknown };
let calls: { url: string; init?: RequestInit }[];
let replies: Record<string, Reply | Reply[]>;

function reply(path: string): Reply {
  const r = replies[path];
  return Array.isArray(r) ? (r.shift() ?? { status: 500 }) : (r ?? { status: 404 });
}

beforeEach(() => {
  calls = [];
  replies = {};
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body = {} } = reply(new URL(url).pathname);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
});

function service(opts: { api?: boolean; tenant?: string | null } = {}): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ASSURANCE_ENV,
        useValue: opts.api === false ? { ...env, apiBaseUrl: undefined } : env,
      },
      {
        provide: TenantService,
        useValue: { tenantId: () => (opts.tenant === undefined ? 'acme' : opts.tenant) },
      },
    ],
  });
  return TestBed.inject(AuthService);
}

const signInReplies = (): Record<string, Reply> => ({
  '/api/auth/refresh': { status: 401 },
  '/api/auth/login': { body: { access: 'tok-1', expiresIn: 900 } },
  '/api/me': { body: ME },
});

describe('AuthService', () => {
  it('is signed out when there is no session to restore', async () => {
    replies = signInReplies();
    const auth = service();
    await auth.ready();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.principal()).toBeNull();
    expect(await auth.getAccessToken()).toBeNull();
  });

  it('restores a session from the refresh cookie on start', async () => {
    replies = {
      '/api/auth/refresh': { body: { access: 'tok-r', expiresIn: 900 } },
      '/api/me': { body: ME },
    };
    const auth = service();
    await auth.ready();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.uid()).toBe('m1');
    expect(auth.claims()).toEqual({ role: 'learner', tenantId: 'acme', entitlements: [] });
    expect(calls.find((c) => c.url.endsWith('/api/me'))?.init?.headers).toMatchObject({
      Authorization: 'Bearer tok-r',
      'X-Forge-Tenant': 'acme',
    });
  });

  it('signs in with the host tenant, sends the cookie, and loads the membership', async () => {
    replies = signInReplies();
    const auth = service();
    await auth.ready();
    await auth.signInWithPassword('ada@example.com', 'a long passphrase');

    const login = calls.find((c) => c.url.endsWith('/api/auth/login'))!;
    expect(login.init?.credentials).toBe('include');
    expect(login.init?.headers).toMatchObject({ 'X-Forge-Client': 'web' });
    expect(JSON.parse(login.init?.body as string)).toEqual({
      email: 'ada@example.com',
      password: 'a long passphrase',
      tenant: 'acme',
    });
    expect(auth.principal()).toEqual({
      uid: 'm1',
      email: 'ada@example.com',
      displayName: 'Ada',
      claims: { role: 'learner', tenantId: 'acme', entitlements: [] },
    });
    expect(await auth.getAccessToken()).toBe('tok-1');
  });

  it.each([
    [401, 'auth/invalid-credential'],
    [429, 'auth/too-many-requests'],
  ])('maps a %i from login to %s', async (status, code) => {
    replies = { ...signInReplies(), '/api/auth/login': { status, body: { detail: 'no' } } };
    const auth = service();
    await auth.ready();
    await expect(auth.signInWithPassword('a@b.co', 'x')).rejects.toMatchObject({ code });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('reports a network failure as auth/network-request-failed', async () => {
    replies = signInReplies();
    const auth = service();
    await auth.ready();
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(auth.signInWithPassword('a@b.co', 'x')).rejects.toMatchObject({
      code: 'auth/network-request-failed',
    });
  });

  it('refreshes once when several callers need a token at the same time', async () => {
    replies = {
      // Startup restore hands out a token that is already inside the expiry margin.
      '/api/auth/refresh': [
        { body: { access: 'tok-1', expiresIn: 5 } },
        { body: { access: 'tok-2', expiresIn: 900 } },
      ],
      '/api/me': { body: ME },
    };
    const auth = service();
    await auth.ready();
    const tokens = await Promise.all([
      auth.getAccessToken(),
      auth.getAccessToken(),
      auth.getAccessToken(),
    ]);
    expect(tokens).toEqual(['tok-2', 'tok-2', 'tok-2']);
    expect(calls.filter((c) => c.url.endsWith('/api/auth/refresh'))).toHaveLength(2);
  });

  it('sign-out revokes server-side, clears state, and never throws offline', async () => {
    replies = signInReplies();
    const auth = service();
    await auth.ready();
    await auth.signInWithPassword('ada@example.com', 'a long passphrase');

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(auth.signOutUser()).resolves.toBeUndefined();
    expect(auth.isAuthenticated()).toBe(false);
    expect(await auth.getAccessToken()).toBeNull();
  });

  it('asks the API for a reset email for the host tenant', async () => {
    replies = { ...signInReplies(), '/api/auth/password-reset': { status: 202 } };
    const auth = service();
    await auth.ready();
    await auth.sendPasswordResetEmail('ada@example.com');
    const call = calls.find((c) => c.url.endsWith('/api/auth/password-reset'))!;
    expect(JSON.parse(call.init?.body as string)).toEqual({
      email: 'ada@example.com',
      tenant: 'acme',
    });
  });

  it('turns API password-rule and bad-link errors into AuthError codes', async () => {
    replies = {
      ...signInReplies(),
      '/api/auth/password-reset/confirm': [
        { status: 400, body: { password: ['This password is too short.'] } },
        { status: 400, body: { token: 'This link is invalid or has expired.' } },
        { status: 204 },
      ],
    };
    const auth = service();
    await auth.ready();
    await expect(auth.confirmPasswordReset('t', 'short')).rejects.toMatchObject({
      code: 'auth/weak-password',
      message: 'This password is too short.',
    });
    await expect(auth.confirmPasswordReset('t', 'x')).rejects.toMatchObject({
      code: 'auth/invalid-action-code',
    });
    await expect(auth.confirmPasswordReset('t', 'a long passphrase')).resolves.toBeUndefined();
  });

  it('does not offer self-service sign-up', async () => {
    replies = signInReplies();
    const auth = service();
    await auth.ready();
    await expect(auth.signUp('a@b.co', 'x')).rejects.toBeInstanceOf(AuthError);
  });

  it('stays signed out and makes no calls when no API is configured', async () => {
    const auth = service({ api: false });
    await auth.ready();
    expect(auth.isAuthenticated()).toBe(false);
    expect(await auth.getAccessToken()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
