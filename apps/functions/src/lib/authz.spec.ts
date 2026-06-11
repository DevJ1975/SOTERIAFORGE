import { canManageRole, parseCaller, type CallerClaims } from './authz';

const superadmin: CallerClaims = {
  uid: 'super-1',
  role: 'superadmin',
  entitlements: [],
};

const acmeAdmin: CallerClaims = {
  uid: 'admin-1',
  role: 'tenant_admin',
  tenantId: 'acme',
  entitlements: [],
};

const acmeLearner: CallerClaims = {
  uid: 'learner-1',
  role: 'learner',
  tenantId: 'acme',
  entitlements: [],
};

describe('parseCaller', () => {
  it('parses a valid superadmin token (extra token fields stripped)', () => {
    const caller = parseCaller({
      uid: 'super-1',
      role: 'superadmin',
      iss: 'https://securetoken.google.com/x',
      aud: 'x',
    });
    expect(caller).toEqual({ uid: 'super-1', role: 'superadmin', entitlements: [] });
  });

  it('parses a tenant-scoped token', () => {
    const caller = parseCaller({ uid: 'u1', role: 'instructor', tenantId: 'acme' });
    expect(caller).toMatchObject({ role: 'instructor', tenantId: 'acme' });
  });

  it('returns null for a token without a role claim', () => {
    expect(parseCaller({ uid: 'u1', email: 'x@y.z' })).toBeNull();
  });

  it('returns null for a non-superadmin token missing tenantId', () => {
    expect(parseCaller({ uid: 'u1', role: 'learner' })).toBeNull();
  });

  it('returns null for undefined (unauthenticated)', () => {
    expect(parseCaller(undefined)).toBeNull();
  });
});

describe('canManageRole', () => {
  it('superadmin may grant superadmin', () => {
    expect(canManageRole(superadmin, { targetRole: 'superadmin' }).allowed).toBe(true);
  });

  it('superadmin may grant any tenant-scoped role in any tenant', () => {
    expect(
      canManageRole(superadmin, { targetRole: 'tenant_admin', targetTenantId: 'globex' }).allowed,
    ).toBe(true);
    expect(
      canManageRole(superadmin, { targetRole: 'learner', targetTenantId: 'acme' }).allowed,
    ).toBe(true);
  });

  it('tenant_admin may grant non-superadmin roles within their own tenant', () => {
    expect(
      canManageRole(acmeAdmin, { targetRole: 'instructor', targetTenantId: 'acme' }).allowed,
    ).toBe(true);
    expect(
      canManageRole(acmeAdmin, { targetRole: 'learner', targetTenantId: 'acme' }).allowed,
    ).toBe(true);
    expect(
      canManageRole(acmeAdmin, { targetRole: 'b2c_customer', targetTenantId: 'acme' }).allowed,
    ).toBe(true);
    expect(
      canManageRole(acmeAdmin, { targetRole: 'tenant_admin', targetTenantId: 'acme' }).allowed,
    ).toBe(true);
  });

  it('tenant_admin may NEVER grant superadmin', () => {
    const decision = canManageRole(acmeAdmin, { targetRole: 'superadmin' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/superadmin/);
  });

  it('tenant_admin is denied cross-tenant', () => {
    const decision = canManageRole(acmeAdmin, { targetRole: 'learner', targetTenantId: 'globex' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/own tenant/);
  });

  it('tenant_admin is denied when target tenant is missing', () => {
    expect(canManageRole(acmeAdmin, { targetRole: 'learner' }).allowed).toBe(false);
  });

  it('learner is denied everything', () => {
    expect(
      canManageRole(acmeLearner, { targetRole: 'learner', targetTenantId: 'acme' }).allowed,
    ).toBe(false);
  });

  it('null (unauthenticated) caller is denied', () => {
    const decision = canManageRole(null, { targetRole: 'learner', targetTenantId: 'acme' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBeTruthy();
  });
});
