import { FakeFirestore, makeFakeAuth } from '../test/fake-firestore';

const mockDb = new FakeFirestore();
const mockAuth = makeFakeAuth();
const mockAuditLog = jest.fn((..._args: unknown[]) => Promise.resolve());

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (handler: (req: unknown) => unknown) => handler,
  HttpsError: require('../test/fake-firestore').FakeHttpsError,
}));
jest.mock('../lib/admin', () => ({ db: mockDb, adminAuth: mockAuth }));
jest.mock('../lib/audit', () => ({ auditLog: (...args: unknown[]) => mockAuditLog(...args) }));

import { setMemberRole } from './set-custom-claims';

type Handler = (req: unknown) => Promise<Record<string, unknown>>;
const call = setMemberRole as unknown as Handler;

const TENANT = 'acme';

function req(data: Record<string, unknown>, token: Record<string, unknown>) {
  return { auth: { uid: 'caller', token }, data: { tenantId: TENANT, uid: 'u1', ...data } };
}

beforeEach(() => {
  mockDb.store.clear();
  mockAuth._users.clear();
  mockAuth.setCustomUserClaims.mockClear();
  mockDb.seed(`tenants/${TENANT}`, { id: TENANT, gcipTenantId: undefined });
});

describe('setMemberRole (privilege escalation guards)', () => {
  it('forbids a tenant_admin from minting a superadmin', async () => {
    await expect(
      call(req({ role: 'superadmin' }, { role: 'tenant_admin', tenantId: TENANT })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('forbids a tenant_admin acting on another tenant', async () => {
    await expect(
      call(req({ role: 'learner', tenantId: 'bravo' }, { role: 'tenant_admin', tenantId: TENANT })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects an unknown role (schema validation)', async () => {
    await expect(call(req({ role: 'root' }, { role: 'superadmin' }))).rejects.toBeDefined();
  });

  it('404s when the tenant does not exist', async () => {
    mockDb.store.clear();
    await expect(call(req({ role: 'learner' }, { role: 'superadmin' }))).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('preserves existing B2C entitlements when a role changes', async () => {
    mockAuth._users.set('u1', {
      customClaims: { role: 'learner', tenantId: TENANT, entitlements: ['prod_x'] },
    });

    const result = await call(req({ role: 'instructor' }, { role: 'superadmin' }));

    expect(result).toEqual({ ok: true });
    const claims = mockAuth._users.get('u1')?.customClaims as Record<string, unknown>;
    expect(claims['role']).toBe('instructor');
    expect(claims['entitlements']).toEqual(['prod_x']);
    // Member doc reflects the new role + active status.
    const member = mockDb.store.get(`tenants/${TENANT}/members/u1`) as Record<string, unknown>;
    expect(member).toMatchObject({ role: 'instructor', status: 'active' });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('lets a superadmin assign superadmin', async () => {
    await expect(call(req({ role: 'superadmin' }, { role: 'superadmin' }))).resolves.toEqual({
      ok: true,
    });
  });
});
