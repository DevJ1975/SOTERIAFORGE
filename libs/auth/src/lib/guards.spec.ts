import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import type { CustomClaims } from '@assurance/shared';
import { AuthService } from './auth.service';
import { type ForgeAccess, type ForgeMe, ForgeSession } from './forge-api';
import { authGuard, roleGuard, superadminGuard, tenantGuard } from './guards';
import { TenantService } from './tenant.service';

let access: ForgeAccess;
let signedIn: boolean;
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

/** The claims AuthService derives from the API's membership. */
function claimsFor(a: ForgeAccess): CustomClaims | null {
  if (a.kind !== 'member') return null;
  return {
    role: a.me.member.role,
    tenantId: a.me.tenant?.id ?? a.me.member.tenantId ?? undefined,
    entitlements: [],
  };
}

function run(guard: ReturnType<typeof roleGuard>, url = '/'): Promise<true | string> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ForgeSession, useValue: { settled: async () => access } },
      {
        provide: AuthService,
        useValue: {
          ready: async () => undefined,
          claims: () => claimsFor(access),
          isAuthenticated: () => signedIn,
        },
      },
      { provide: TenantService, useValue: { tenantId: () => hostTenant } },
    ],
  });
  const router = TestBed.inject(Router);
  return TestBed.runInInjectionContext(async () => {
    const result = await guard({} as never, { url } as never);
    return result === true ? true : router.serializeUrl(result as UrlTree);
  });
}

describe('route guards', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    hostTenant = 'lakewood';
    signedIn = true;
    access = { kind: 'member', me: me() };
  });

  it('authGuard lets a signed-in user through and sends others to /login with a return URL', async () => {
    expect(await run(authGuard, '/courses')).toBe(true);
    signedIn = false;
    expect(await run(authGuard, '/courses')).toBe('/login?returnUrl=%2Fcourses');
  });

  it('allow a role the API grants', async () => {
    access = { kind: 'member', me: me({ role: 'instructor' }) };
    expect(await run(roleGuard('instructor'))).toBe(true);
  });

  it('deny a role the API does not grant', async () => {
    expect(await run(roleGuard('tenant_admin'))).toBe('/forbidden');
  });

  it('deny when the API refuses', async () => {
    access = { kind: 'denied' };
    expect(await run(superadminGuard)).toBe('/forbidden');
    expect(await run(tenantGuard)).toBe('/forbidden');
  });

  it('deny when the API is unavailable (no fallback to unverified claims)', async () => {
    access = { kind: 'unavailable' };
    expect(await run(roleGuard('learner'))).toBe('/forbidden');
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
});
