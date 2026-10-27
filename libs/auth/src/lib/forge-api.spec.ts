import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ASSURANCE_ENV, type AssuranceEnvironment } from './assurance-environment';
import { AuthService } from './auth.service';
import type { ForgeMe } from './forge-me';
import { ForgeSession, forgeApiInterceptor, forgeApiUrl } from './forge-api';
import { TenantService } from './tenant.service';

const env: AssuranceEnvironment = {
  production: false,
  rootDomain: 'localhost',
  apiBaseUrl: 'https://api.test',
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
};

const ME: ForgeMe = {
  member: {
    id: 'm1',
    uid: 'm1',
    tenantId: 'acme',
    email: 'a@example.com',
    displayName: 'A',
    role: 'instructor',
    status: 'active',
  },
  tenant: { id: 'acme', name: 'Acme', status: 'active', branding: {} },
  canAuthor: true,
};

describe('forgeApiUrl', () => {
  it('joins base and path with exactly one slash', () => {
    expect(forgeApiUrl('https://api.test/', '/api/me')).toBe('https://api.test/api/me');
    expect(forgeApiUrl('https://api.test', 'api/me')).toBe('https://api.test/api/me');
  });
});

describe('forgeApiInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let token: string | null;
  let renewed: string | null;
  const renewAccessToken = jest.fn(async () => renewed);

  beforeEach(() => {
    token = 'tok-1';
    renewed = 'tok-2';
    renewAccessToken.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([forgeApiInterceptor])),
        provideHttpClientTesting(),
        { provide: ASSURANCE_ENV, useValue: env },
        { provide: AuthService, useValue: { getAccessToken: async () => token, renewAccessToken } },
        { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  const flush = () => new Promise<void>((r) => setTimeout(r));

  it('adds the bearer token and tenant to Forge API requests', async () => {
    http.get('https://api.test/api/me').subscribe();
    await flush();
    const req = httpMock.expectOne('https://api.test/api/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-1');
    expect(req.request.headers.get('X-Forge-Tenant')).toBe('acme');
    req.flush({});
  });

  it('never sends the token anywhere else', async () => {
    http.get('https://cdn.example.com/file.pdf').subscribe();
    await flush();
    const req = httpMock.expectOne('https://cdn.example.com/file.pdf');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.has('X-Forge-Tenant')).toBe(false);
    req.flush({});
  });

  it('omits Authorization when signed out but still names the tenant', async () => {
    token = null;
    http.get('https://api.test/api/health').subscribe();
    await flush();
    const req = httpMock.expectOne('https://api.test/api/health');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.get('X-Forge-Tenant')).toBe('acme');
    req.flush({});
  });

  it('retries once with a renewed token after a 401', async () => {
    const result = jest.fn();
    http.get('https://api.test/api/me').subscribe(result);
    await flush();
    httpMock
      .expectOne('https://api.test/api/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await flush();
    const retry = httpMock.expectOne('https://api.test/api/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer tok-2');
    retry.flush({ ok: true });
    expect(renewAccessToken).toHaveBeenCalledTimes(1);
    expect(result).toHaveBeenCalledWith({ ok: true });
  });

  it('surfaces the 401 when the session cannot be renewed', async () => {
    renewed = null;
    const error = jest.fn();
    http.get('https://api.test/api/me').subscribe({ error });
    await flush();
    httpMock
      .expectOne('https://api.test/api/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await flush();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('does not try to renew when the request had no token', async () => {
    token = null;
    const error = jest.fn();
    http.get('https://api.test/api/me').subscribe({ error });
    await flush();
    httpMock
      .expectOne('https://api.test/api/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await flush();
    expect(renewAccessToken).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});

describe('ForgeSession', () => {
  const meSignal = signal<ForgeMe | null>(null);
  const meStatus = signal<number | null>(null);

  function session(): ForgeSession {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { ready: async () => undefined, me: meSignal, meStatus },
        },
      ],
    });
    return TestBed.inject(ForgeSession);
  }

  beforeEach(() => {
    meSignal.set(null);
    meStatus.set(null);
  });

  it('exposes the member, role and authoring ability from the API', async () => {
    meSignal.set(ME);
    const s = session();
    expect(s.role()).toBe('instructor');
    expect(s.canAuthor()).toBe(true);
    expect(await s.settled()).toEqual({ kind: 'member', me: ME });
  });

  it.each([401, 403])('classifies a %i from /api/me as denied', async (status) => {
    meStatus.set(status);
    expect(await session().settled()).toEqual({ kind: 'denied' });
  });

  it('classifies no session or an API outage as unavailable', async () => {
    expect(await session().settled()).toEqual({ kind: 'unavailable' });
    meStatus.set(0);
    expect(await session().settled()).toEqual({ kind: 'unavailable' });
    expect(session().role()).toBeNull();
  });
});
