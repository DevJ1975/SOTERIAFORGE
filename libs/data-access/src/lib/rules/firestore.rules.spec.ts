import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Firestore security-rules tests — the authoritative tenant-isolation +
 * RBAC acceptance probe. Runs ONLY under the Firestore emulator:
 *   firebase emulators:exec --only firestore "npx nx test-rules data-access"
 */
const PROJECT_ID = 'soteria-forge-rules-test';

let testEnv: RulesTestEnvironment;

const learnerAcme = () =>
  testEnv.authenticatedContext('u-learner', { role: 'learner', tenantId: 'acme' }).firestore();
const adminAcme = () =>
  testEnv.authenticatedContext('u-admin', { role: 'tenant_admin', tenantId: 'acme' }).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed cross-tenant data with rules disabled.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/acme/members/u-learner'), {
      uid: 'u-learner',
      tenantId: 'acme',
      role: 'learner',
      status: 'active',
      email: 'l@acme.test',
    });
    await setDoc(doc(db, 'tenants/bravo/members/u-other'), {
      uid: 'u-other',
      tenantId: 'bravo',
      role: 'learner',
      status: 'active',
      email: 'o@bravo.test',
    });
  });
});

describe('Firestore rules — tenant isolation', () => {
  it('a learner can read their own member doc in their tenant', async () => {
    await assertSucceeds(getDoc(doc(learnerAcme(), 'tenants/acme/members/u-learner')));
  });

  it('a learner CANNOT read another tenant member doc', async () => {
    await assertFails(getDoc(doc(learnerAcme(), 'tenants/bravo/members/u-other')));
  });

  it('a learner CANNOT author courses', async () => {
    await assertFails(
      setDoc(doc(learnerAcme(), 'tenants/acme/courses/c1'), {
        id: 'c1',
        tenantId: 'acme',
        title: 'X',
        status: 'draft',
      }),
    );
  });

  it('a tenant_admin CAN author courses in their tenant', async () => {
    await assertSucceeds(
      setDoc(doc(adminAcme(), 'tenants/acme/courses/c1'), {
        id: 'c1',
        tenantId: 'acme',
        title: 'X',
        status: 'draft',
      }),
    );
  });

  it('a tenant_admin CANNOT author courses in another tenant', async () => {
    await assertFails(
      setDoc(doc(adminAcme(), 'tenants/bravo/courses/c2'), {
        id: 'c2',
        tenantId: 'bravo',
        title: 'X',
        status: 'draft',
      }),
    );
  });

  it('a learner CANNOT escalate their own role via a member update', async () => {
    await assertFails(
      setDoc(
        doc(learnerAcme(), 'tenants/acme/members/u-learner'),
        {
          uid: 'u-learner',
          tenantId: 'acme',
          role: 'tenant_admin',
          status: 'active',
          email: 'l@acme.test',
        },
        { merge: true },
      ),
    );
  });
});
