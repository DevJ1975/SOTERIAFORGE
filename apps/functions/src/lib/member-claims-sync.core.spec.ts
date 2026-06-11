import { FakeAuthPort } from './fakes';
import { syncMemberClaimsCore } from './member-claims-sync.core';

const base = { tenantId: 'acme', uid: 'user-1' };

describe('syncMemberClaimsCore', () => {
  it('is a no-op when role and status are unchanged', async () => {
    const auth = new FakeAuthPort();
    const doc = { role: 'learner', status: 'active', xp: 10 };
    const result = await syncMemberClaimsCore(
      { auth },
      { ...base, before: doc, after: { ...doc, xp: 999 } },
    );
    expect(result.action).toBe('noop');
    expect(auth.setClaimsCalls).toHaveLength(0);
  });

  it('clears claims (null) when a member is deactivated', async () => {
    const auth = new FakeAuthPort();
    const result = await syncMemberClaimsCore(
      { auth },
      {
        ...base,
        before: { role: 'learner', status: 'active' },
        after: { role: 'learner', status: 'deactivated' },
      },
    );
    expect(result.action).toBe('cleared');
    expect(auth.setClaimsCalls).toEqual([{ uid: 'user-1', claims: null }]);
  });

  it('rebuilds claims when the role changes', async () => {
    const auth = new FakeAuthPort();
    const result = await syncMemberClaimsCore(
      { auth },
      {
        ...base,
        before: { role: 'learner', status: 'active' },
        after: { role: 'instructor', status: 'active' },
      },
    );
    expect(result.action).toBe('updated');
    expect(auth.claims.get('user-1')).toEqual({
      role: 'instructor',
      tenantId: 'acme',
      entitlements: [],
    });
  });

  it('rebuilds claims on reactivation even when the role is unchanged', async () => {
    const auth = new FakeAuthPort();
    const result = await syncMemberClaimsCore(
      { auth },
      {
        ...base,
        before: { role: 'learner', status: 'deactivated' },
        after: { role: 'learner', status: 'active' },
      },
    );
    expect(result.action).toBe('updated');
    expect(auth.claims.get('user-1')).toMatchObject({ role: 'learner', tenantId: 'acme' });
  });

  it('clears claims when the member doc is deleted', async () => {
    const auth = new FakeAuthPort();
    const result = await syncMemberClaimsCore(
      { auth },
      { ...base, before: { role: 'learner', status: 'active' }, after: null },
    );
    expect(result.action).toBe('cleared');
    expect(auth.claims.get('user-1')).toBeNull();
  });

  it('is a no-op when both snapshots are missing', async () => {
    const auth = new FakeAuthPort();
    const result = await syncMemberClaimsCore({ auth }, { ...base, before: null, after: null });
    expect(result.action).toBe('noop');
    expect(auth.setClaimsCalls).toHaveLength(0);
  });

  it('skips (never writes invalid claims) when the new role is unknown', async () => {
    const auth = new FakeAuthPort();
    const result = await syncMemberClaimsCore(
      { auth },
      {
        ...base,
        before: { role: 'learner', status: 'active' },
        after: { role: 'wizard', status: 'active' },
      },
    );
    expect(result.action).toBe('skipped');
    expect(auth.setClaimsCalls).toHaveLength(0);
  });

  it('is a no-op for non-deactivating status changes with the same role', async () => {
    const auth = new FakeAuthPort();
    const result = await syncMemberClaimsCore(
      { auth },
      {
        ...base,
        before: { role: 'learner', status: 'invited' },
        after: { role: 'learner', status: 'active' },
      },
    );
    expect(result.action).toBe('noop');
    expect(auth.setClaimsCalls).toHaveLength(0);
  });
});
