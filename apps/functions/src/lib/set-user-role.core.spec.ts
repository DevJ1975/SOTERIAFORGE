import { FunctionsDomainError } from './errors';
import { makeFakes } from './fakes';
import { setUserRoleCore } from './set-user-role.core';

const superToken = { uid: 'super-1', role: 'superadmin' };
const acmeAdminToken = { uid: 'admin-1', role: 'tenant_admin', tenantId: 'acme' };

describe('setUserRoleCore', () => {
  it('happy path: sets claims and mirrors role onto the member doc', async () => {
    const deps = makeFakes();
    const result = await setUserRoleCore(deps, acmeAdminToken, {
      uid: 'user-1',
      role: 'instructor',
      tenantId: 'acme',
    });

    expect(result).toEqual({ uid: 'user-1', role: 'instructor', tenantId: 'acme' });
    expect(deps.auth.claims.get('user-1')).toEqual({
      role: 'instructor',
      tenantId: 'acme',
      entitlements: [],
    });
    expect(deps.db.members.get('acme/user-1')).toEqual({ role: 'instructor' });
  });

  it('superadmin grant carries no tenantId and writes no member doc', async () => {
    const deps = makeFakes();
    const result = await setUserRoleCore(deps, superToken, {
      uid: 'user-2',
      role: 'superadmin',
    });

    expect(result).toEqual({ uid: 'user-2', role: 'superadmin' });
    expect(deps.auth.claims.get('user-2')).toEqual({ role: 'superadmin', entitlements: [] });
    expect(deps.db.members.size).toBe(0);
  });

  it('rejects a tenant-scoped role without tenantId as invalid-argument', async () => {
    const deps = makeFakes();
    await expect(
      setUserRoleCore(deps, superToken, { uid: 'user-3', role: 'learner' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(deps.auth.setClaimsCalls).toHaveLength(0);
  });

  it('rejects an unknown role as invalid-argument', async () => {
    const deps = makeFakes();
    await expect(
      setUserRoleCore(deps, superToken, { uid: 'user-3', role: 'wizard', tenantId: 'acme' }),
    ).rejects.toBeInstanceOf(FunctionsDomainError);
  });

  it('denies an unauthorized caller with permission-denied before any writes', async () => {
    const deps = makeFakes();
    await expect(
      setUserRoleCore(
        deps,
        { uid: 'l1', role: 'learner', tenantId: 'acme' },
        { uid: 'user-4', role: 'learner', tenantId: 'acme' },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.auth.setClaimsCalls).toHaveLength(0);
    expect(deps.db.members.size).toBe(0);
  });

  it('denies tenant_admin granting superadmin', async () => {
    const deps = makeFakes();
    await expect(
      setUserRoleCore(deps, acmeAdminToken, { uid: 'user-5', role: 'superadmin' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('writes a best-effort audit event on success', async () => {
    const deps = makeFakes();
    await setUserRoleCore(deps, acmeAdminToken, {
      uid: 'user-1',
      role: 'instructor',
      tenantId: 'acme',
    });
    expect(deps.audit.events).toHaveLength(1);
    expect(deps.audit.events[0]).toMatchObject({
      actorUid: 'admin-1',
      actorRole: 'tenant_admin',
      tenantId: 'acme',
      action: 'setUserRole',
      target: 'user-1',
      metadata: { role: 'instructor' },
    });
  });

  it('does not audit when the caller is denied', async () => {
    const deps = makeFakes();
    await expect(
      setUserRoleCore(deps, acmeAdminToken, { uid: 'user-5', role: 'superadmin' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.audit.events).toHaveLength(0);
  });

  it('still succeeds when the audit write fails (non-fatal)', async () => {
    const deps = makeFakes();
    deps.audit.failNext = true;
    const result = await setUserRoleCore(deps, acmeAdminToken, {
      uid: 'user-1',
      role: 'instructor',
      tenantId: 'acme',
    });
    expect(result).toEqual({ uid: 'user-1', role: 'instructor', tenantId: 'acme' });
    expect(deps.audit.events).toHaveLength(0);
  });
});
