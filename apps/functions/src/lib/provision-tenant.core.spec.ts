import { makeFakes } from './fakes';
import { provisionTenantCore } from './provision-tenant.core';

const superToken = { uid: 'super-1', role: 'superadmin' };

describe('provisionTenantCore', () => {
  it('denies non-superadmin callers', async () => {
    const deps = makeFakes();
    await expect(
      provisionTenantCore(
        deps,
        { uid: 'admin-1', role: 'tenant_admin', tenantId: 'acme' },
        { id: 'newco', name: 'NewCo' },
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.db.tenants.size).toBe(0);
  });

  it('rejects a duplicate tenant id with already-exists', async () => {
    const deps = makeFakes();
    deps.db.tenants.set('acme', { id: 'acme' });
    await expect(
      provisionTenantCore(deps, superToken, { id: 'acme', name: 'Acme Again' }),
    ).rejects.toMatchObject({ code: 'already-exists' });
  });

  it('tolerates GCIP being unavailable (gcipTenantId null, doc written without it)', async () => {
    const deps = makeFakes();
    deps.auth.gcipResult = null;

    const result = await provisionTenantCore(deps, superToken, { id: 'newco', name: 'NewCo' });

    expect(result).toEqual({ id: 'newco', gcipTenantId: null, adminInvited: false });
    const doc = deps.db.tenants.get('newco');
    expect(doc).toMatchObject({
      id: 'newco',
      name: 'NewCo',
      status: 'active',
      plan: 'starter',
      branding: { colors: {} },
      createdBy: 'super-1',
    });
    expect(doc && 'gcipTenantId' in doc).toBe(false);
  });

  it('stores the GCIP tenant id when Identity Platform is available', async () => {
    const deps = makeFakes();
    deps.auth.gcipResult = { tenantId: 'gcip-newco' };

    const result = await provisionTenantCore(deps, superToken, {
      id: 'newco',
      name: 'NewCo',
      plan: 'pro',
    });

    expect(result.gcipTenantId).toBe('gcip-newco');
    expect(deps.db.tenants.get('newco')).toMatchObject({
      gcipTenantId: 'gcip-newco',
      plan: 'pro',
    });
  });

  it('invites the first tenant_admin when adminEmail is given', async () => {
    const deps = makeFakes();
    deps.auth.gcipResult = { tenantId: 'gcip-newco' };

    const result = await provisionTenantCore(deps, superToken, {
      id: 'newco',
      name: 'NewCo',
      adminEmail: 'boss@newco.com',
    });

    expect(result.adminInvited).toBe(true);
    expect(deps.auth.createdUids).toHaveLength(1);
    const uid = deps.auth.createdUids[0];
    expect(deps.db.members.get(`newco/${uid}`)).toMatchObject({
      role: 'tenant_admin',
      status: 'invited',
      email: 'boss@newco.com',
      tenantId: 'newco',
    });
    expect(deps.auth.claims.get(uid)).toMatchObject({
      role: 'tenant_admin',
      tenantId: 'newco',
      gcipTenantId: 'gcip-newco',
    });
  });

  it('rejects an invalid tenant id as invalid-argument', async () => {
    const deps = makeFakes();
    await expect(
      provisionTenantCore(deps, superToken, { id: 'Bad_ID!', name: 'Bad' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
