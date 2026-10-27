jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(() => () => undefined),
  onIdTokenChanged: jest.fn(() => () => undefined),
}));

import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import type { CustomClaims } from '@assurance/shared';
import { AuthService } from './auth.service';
import { type ForgeAccess, type ForgeMe, ForgeSession } from './forge-api';
import { roleGuard, superadminGuard, tenantGuard } from './guards';
import { TenantService } from './tenant.service';

let access: ForgeAccess;
let claims: CustomClaims | null;
let hostTenant: string | null;

function me(over: Partial<ForgeMe['member']> = {}): ForgeMe {
  return {
    member: {
      id: 'm1',
      uid: 'marcus',
      tenantId: 'lakewood',
      email: 'm@example.com',
      displayName: 'Marcus',
      role: 'learner',
      status: 'active',
      ...over,
    },
    tenant:
      over.tenantId === null
        ? null
        : { id: over.tenantId ?? 'lakewood', name: 'Lakewood', status: 'active', branding: {} },
    canAuthor: false,
  };
}

const refreshClaims = jest.fn(async () => claims);

function run(guard: ReturnType<typeof roleGuard>): Promise<true | string> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ForgeSession, useValue: { settled: async () => access } },
      {
        provide: AuthService,
        useValue: { claims: () => claims, refreshClaims, isAuthenticated: () => true },
      },
      { provide: TenantService, useValue: { tenantId: () => hostTenant } },
    ],
  });
  const router = TestBed.inject(Router);
  return TestBed.runInInjectionContext(async () => {
    const result = await guard({} as never, { url: '/' } as never);
    return result === true ? true : router.serializeUrl(result as UrlTree);
  });
}

describe('route guards', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    jest.clearAllMocks();
    hostTenant = 'lakewood';
    claims = { role: 'learner', tenantId: 'lakewood', entitlements: [] };
    access = { kind: 'member', me: me() };
  });

  it('use the API role over stale claims (promotion)', async () => {
    access = { kind: 'member', me: me({ role: 'instructor' }) };
    expect(await run(roleGuard('instructor'))).toBe(true);
  });

  it('use the API role over stale claims (demotion)', async () => {
    claims = { role: 'tenant_admin', tenantId: 'lakewood', entitlements: [] };
    expect(await run(roleGuard('tenant_admin'))).toBe('/forbidden');
  });

  it('deny when the API refuses, whatever the claims say', async () => {
    claims = { role: 'superadmin', entitlements: [] };
    access = { kind: 'denied' };
    expect(await run(superadminGuard)).toBe('/forbidden');
    expect(await run(tenantGuard)).toBe('/forbidden');
  });

  it('deny members the API reports as not active', async () => {
    access = { kind: 'member', me: me({ status: 'invited' }) };
    expect(await run(tenantGuard)).toBe('/forbidden');
  });

  it('keep tenant isolation on the API tenant', async () => {
    hostTenant = 'acme';
    expect(await run(tenantGuard)).toBe('/forbidden');
    hostTenant = 'lakewood';
    expect(await run(tenantGuard)).toBe(true);
  });

  it('let a superadmin into any tenant', async () => {
    access = { kind: 'member', me: me({ role: 'superadmin', tenantId: null }) };
    hostTenant = 'acme';
    expect(await run(tenantGuard)).toBe(true);
    expect(await run(superadminGuard)).toBe(true);
  });

  it('fall back to claims only when the API is unavailable', async () => {
    access = { kind: 'unavailable' };
    claims = { role: 'instructor', tenantId: 'lakewood', entitlements: [] };
    expect(await run(roleGuard('instructor'))).toBe(true);
    claims = null;
    expect(await run(roleGuard('instructor'))).toBe('/forbidden');
    expect(refreshClaims).toHaveBeenCalled();
  });
});
