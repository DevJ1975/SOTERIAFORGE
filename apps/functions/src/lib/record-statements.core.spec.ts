import { XAPI_TENANT_EXTENSION } from '@forge/shared';
import { FakeStatementDbPort } from './fakes';
import { MAX_STATEMENTS_PER_BATCH, recordStatementsCore } from './record-statements.core';

const learnerToken = { uid: 'learner-1', role: 'learner', tenantId: 'acme' };
const instructorToken = { uid: 'instructor-1', role: 'instructor', tenantId: 'acme' };
const superToken = { uid: 'super-1', role: 'superadmin' };

/** A minimal valid statement scoped to `tenantId`. */
function statement(id: string, tenantId = 'acme'): Record<string, unknown> {
  return {
    id,
    actor: {
      objectType: 'Agent',
      account: { homePage: 'https://soteriaforge.com', name: 'learner-1' },
    },
    verb: { id: 'http://adlnet.gov/expapi/verbs/progressed', display: { 'en-US': 'progressed' } },
    object: {
      objectType: 'Activity',
      id: `https://soteriaforge.com/xapi/activities/lesson/${tenantId}/c1/l1`,
    },
    context: { extensions: { [XAPI_TENANT_EXTENSION]: tenantId } },
    timestamp: '2026-06-11T12:00:00.000Z',
    version: '1.0.3',
  };
}

describe('recordStatementsCore', () => {
  it('happy path: writes every statement under the caller tenant with receivedAt', async () => {
    const db = new FakeStatementDbPort();
    const result = await recordStatementsCore({ db }, learnerToken, {
      statements: [statement('s-1'), statement('s-2'), statement('s-3')],
    });

    expect(result).toEqual({ tenantId: 'acme', written: 3 });
    expect(db.statements.size).toBe(3);
    expect(db.saveCalls.map((c) => `${c.tenantId}/${c.statementId}`)).toEqual([
      'acme/s-1',
      'acme/s-2',
      'acme/s-3',
    ]);
    const stored = db.statements.get('acme/s-2');
    expect(stored).toMatchObject(statement('s-2'));
    expect(typeof stored?.['receivedAt']).toBe('string');
  });

  it('lets any tenant-scoped role record into its own tenant (instructor)', async () => {
    const db = new FakeStatementDbPort();
    await expect(
      recordStatementsCore({ db }, instructorToken, { statements: [statement('s-1')] }),
    ).resolves.toEqual({ tenantId: 'acme', written: 1 });
  });

  it('rejects tenant spoofing in the context extension before any write', async () => {
    const db = new FakeStatementDbPort();
    await expect(
      recordStatementsCore({ db }, learnerToken, {
        statements: [statement('s-1', 'acme'), statement('s-2', 'globex')],
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(db.statements.size).toBe(0);
  });

  it('rejects statements missing the tenant extension entirely', async () => {
    const db = new FakeStatementDbPort();
    const noContext = { ...statement('s-1') };
    delete noContext['context'];
    await expect(
      recordStatementsCore({ db }, learnerToken, { statements: [noContext] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(db.statements.size).toBe(0);
  });

  it('rejects unauthenticated and claimless callers', async () => {
    const db = new FakeStatementDbPort();
    await expect(
      recordStatementsCore({ db }, undefined, { statements: [statement('s-1')] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      recordStatementsCore({ db }, { uid: 'u1' }, { statements: [statement('s-1')] }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(db.statements.size).toBe(0);
  });

  it('rejects an empty batch and a batch over the cap as invalid-argument', async () => {
    const db = new FakeStatementDbPort();
    await expect(
      recordStatementsCore({ db }, learnerToken, { statements: [] }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const oversized = Array.from({ length: MAX_STATEMENTS_PER_BATCH + 1 }, (_, i) =>
      statement(`s-${i}`),
    );
    await expect(
      recordStatementsCore({ db }, learnerToken, { statements: oversized }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db.statements.size).toBe(0);
  });

  it.each([
    ['non-object', 'not-a-statement'],
    ['missing id', { ...statement('s-1'), id: undefined }],
    ['missing actor', { ...statement('s-1'), actor: undefined }],
    ['missing verb.id', { ...statement('s-1'), verb: {} }],
    ['missing object.id', { ...statement('s-1'), object: { objectType: 'Activity' } }],
  ])('rejects a malformed statement (%s) as invalid-argument', async (_label, bad) => {
    const db = new FakeStatementDbPort();
    await expect(
      recordStatementsCore({ db }, learnerToken, { statements: [bad] }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(db.statements.size).toBe(0);
  });

  it('requires superadmin to name the target tenant explicitly', async () => {
    const db = new FakeStatementDbPort();
    await expect(
      recordStatementsCore({ db }, superToken, { statements: [statement('s-1')] }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    const result = await recordStatementsCore({ db }, superToken, {
      tenantId: 'acme',
      statements: [statement('s-1')],
    });
    expect(result).toEqual({ tenantId: 'acme', written: 1 });
  });

  it('ignores a non-superadmin input tenantId in favour of the claim', async () => {
    const db = new FakeStatementDbPort();
    // The statement is scoped to the caller's claim tenant; the input tenantId
    // must not be able to redirect the write to another tenant's store.
    await recordStatementsCore({ db }, learnerToken, {
      tenantId: 'globex',
      statements: [statement('s-1', 'acme')],
    });
    expect([...db.statements.keys()]).toEqual(['acme/s-1']);
  });
});
