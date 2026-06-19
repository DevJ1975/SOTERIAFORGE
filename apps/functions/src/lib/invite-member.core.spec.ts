import { makeFakes } from './fakes';
import { inviteMemberCore } from './invite-member.core';

const superToken = { uid: 'super-1', role: 'superadmin' };
const acmeAdminToken = { uid: 'admin-1', role: 'tenant_admin', tenantId: 'acme' };

function seedAcme(deps: ReturnType<typeof makeFakes>, extra: Record<string, unknown> = {}) {
  deps.db.tenants.set('acme', {
    id: 'acme',
    name: 'Acme Safety',
    status: 'active',
    plan: 'starter',
    branding: { colors: {} },
    createdAt: new Date().toISOString(),
    ...extra,
  });
}

describe('inviteMemberCore', () => {
  it('fails with not-found when the tenant does not exist', async () => {
    const deps = makeFakes();
    await expect(
      inviteMemberCore(deps, superToken, {
        email: 'new@acme.com',
        role: 'learner',
        tenantId: 'acme',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('creates the auth user when missing and writes an invited member doc', async () => {
    const deps = makeFakes();
    seedAcme(deps);

    const result = await inviteMemberCore(deps, acmeAdminToken, {
      email: 'new@acme.com',
      role: 'instructor',
      tenantId: 'acme',
      displayName: 'New Instructor',
    });

    expect(deps.auth.createdUids).toHaveLength(1);
    const uid = deps.auth.createdUids[0];
    expect(result).toEqual({ uid, status: 'invited' });

    expect(deps.auth.claims.get(uid)).toEqual({
      role: 'instructor',
      tenantId: 'acme',
      entitlements: [],
    });

    const memberDoc = deps.db.members.get(`acme/${uid}`);
    expect(memberDoc).toMatchObject({
      uid,
      tenantId: 'acme',
      role: 'instructor',
      status: 'invited',
      email: 'new@acme.com',
      displayName: 'New Instructor',
      xp: 0,
      level: 1,
      streakDays: 0,
      createdBy: 'admin-1',
    });
    expect(typeof memberDoc?.['createdAt']).toBe('string');
  });

  it('reuses an existing auth user by email', async () => {
    const deps = makeFakes();
    seedAcme(deps);
    deps.auth.addUser({ uid: 'existing-1', email: 'old@acme.com' });

    const result = await inviteMemberCore(deps, superToken, {
      email: 'old@acme.com',
      role: 'learner',
      tenantId: 'acme',
    });

    expect(result.uid).toBe('existing-1');
    expect(deps.auth.createdUids).toHaveLength(0);
  });

  it('mirrors the tenant gcipTenantId into the claims when present', async () => {
    const deps = makeFakes();
    seedAcme(deps, { gcipTenantId: 'gcip-acme' });

    const result = await inviteMemberCore(deps, superToken, {
      email: 'gcip@acme.com',
      role: 'learner',
      tenantId: 'acme',
    });

    expect(deps.auth.claims.get(result.uid)).toMatchObject({ gcipTenantId: 'gcip-acme' });
  });

  it('rejects a superadmin target role as invalid-argument (not tenant-scoped)', async () => {
    const deps = makeFakes();
    seedAcme(deps);
    await expect(
      inviteMemberCore(deps, superToken, {
        email: 'x@acme.com',
        role: 'superadmin',
        tenantId: 'acme',
      }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('denies a cross-tenant tenant_admin with permission-denied', async () => {
    const deps = makeFakes();
    seedAcme(deps);
    await expect(
      inviteMemberCore(
        deps,
        { uid: 'admin-2', role: 'tenant_admin', tenantId: 'globex' },
        { email: 'x@acme.com', role: 'learner', tenantId: 'acme' },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('writes a best-effort audit event recording the invitation', async () => {
    const deps = makeFakes();
    seedAcme(deps);
    const result = await inviteMemberCore(deps, acmeAdminToken, {
      email: 'new@acme.com',
      role: 'instructor',
      tenantId: 'acme',
    });
    expect(deps.audit.events).toHaveLength(1);
    expect(deps.audit.events[0]).toMatchObject({
      actorUid: 'admin-1',
      actorRole: 'tenant_admin',
      tenantId: 'acme',
      action: 'inviteMember',
      target: result.uid,
      metadata: { role: 'instructor', email: 'new@acme.com', reusedExistingUser: false },
    });
  });

  it('still invites when the audit write fails (non-fatal)', async () => {
    const deps = makeFakes();
    seedAcme(deps);
    deps.audit.failNext = true;
    const result = await inviteMemberCore(deps, acmeAdminToken, {
      email: 'new@acme.com',
      role: 'learner',
      tenantId: 'acme',
    });
    expect(result.status).toBe('invited');
    expect(deps.audit.events).toHaveLength(0);
  });
});
