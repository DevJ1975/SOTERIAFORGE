import { makeFakes } from './fakes';
import { getHostStartUrlCore } from './get-host-start-url.core';

const instructorToken = { uid: 'inst-1', role: 'instructor', tenantId: 'acme' };
const learnerToken = { uid: 'learner-1', role: 'learner', tenantId: 'acme' };
const otherTenantAdmin = { uid: 'admin-2', role: 'tenant_admin', tenantId: 'other' };

describe('getHostStartUrlCore', () => {
  it('returns the private startUrl to an authorized host', async () => {
    const deps = makeFakes();
    deps.db.liveSessionPrivate.set('acme/s-1', { startUrl: 'https://zoom.test/s/zoom-1' });

    const result = await getHostStartUrlCore(deps, instructorToken, { sessionId: 's-1' });
    expect(result).toEqual({ startUrl: 'https://zoom.test/s/zoom-1' });
  });

  it('denies a learner with permission-denied', async () => {
    const deps = makeFakes();
    deps.db.liveSessionPrivate.set('acme/s-1', { startUrl: 'https://zoom.test/s/zoom-1' });
    await expect(
      getHostStartUrlCore(deps, learnerToken, { sessionId: 's-1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies an admin from another tenant (cannot read across tenants)', async () => {
    const deps = makeFakes();
    deps.db.liveSessionPrivate.set('acme/s-1', { startUrl: 'https://zoom.test/s/zoom-1' });
    await expect(
      getHostStartUrlCore(deps, otherTenantAdmin, { sessionId: 's-1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    // Authz uses the caller's own tenant; the 'other' tenant has no such doc anyway.
    expect(deps.db.liveSessionPrivate.get('other/s-1')).toBeUndefined();
  });

  it('throws not-found when the private doc is missing', async () => {
    const deps = makeFakes();
    await expect(
      getHostStartUrlCore(deps, instructorToken, { sessionId: 'ghost' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
