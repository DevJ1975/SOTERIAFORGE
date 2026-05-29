import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Firestore security-rules tests — the authoritative tenant-isolation +
 * RBAC acceptance probe. Runs ONLY under the Firestore emulator:
 *   firebase emulators:exec --only firestore "npx nx test-rules data-access"
 */
// Match the emulator's project (demo-* needs no credentials in CI).
const PROJECT_ID = process.env['GCLOUD_PROJECT'] ?? 'demo-soteria-forge';

let testEnv: RulesTestEnvironment;

const learnerAcme = () =>
  testEnv.authenticatedContext('u-learner', { role: 'learner', tenantId: 'acme' }).firestore();
const adminAcme = () =>
  testEnv.authenticatedContext('u-admin', { role: 'tenant_admin', tenantId: 'acme' }).firestore();
const superadmin = () =>
  testEnv.authenticatedContext('u-superadmin', { role: 'superadmin' }).firestore();
const unauthenticated = () => testEnv.unauthenticatedContext().firestore();

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

// ---------------------------------------------------------------------------
// 1. Superadmin cross-tenant
// ---------------------------------------------------------------------------
describe('Firestore rules — superadmin cross-tenant', () => {
  it('a superadmin CAN read a tenant doc for acme', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme'), { name: 'Acme Corp' });
    });
    await assertSucceeds(getDoc(doc(superadmin(), 'tenants/acme')));
  });

  it('a superadmin CAN read a member doc in acme', async () => {
    await assertSucceeds(getDoc(doc(superadmin(), 'tenants/acme/members/u-learner')));
  });

  it('a superadmin CAN read a member doc in bravo', async () => {
    await assertSucceeds(getDoc(doc(superadmin(), 'tenants/bravo/members/u-other')));
  });
});

// ---------------------------------------------------------------------------
// 2. B2C catalog
// ---------------------------------------------------------------------------
describe('Firestore rules — B2C catalog', () => {
  beforeEach(async () => {
    // Seed a catalog product so read tests work against a real doc.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'catalog/prod-1'), {
        name: 'Course Pack',
        price: 99,
      });
    });
  });

  it('an unauthenticated user CAN read a catalog product (public)', async () => {
    await assertSucceeds(getDoc(doc(unauthenticated(), 'catalog/prod-1')));
  });

  it('an unauthenticated user CANNOT write a catalog product', async () => {
    await assertFails(
      setDoc(doc(unauthenticated(), 'catalog/prod-new'), { name: 'Hack', price: 0 }),
    );
  });

  it('a learner CANNOT write a catalog product', async () => {
    await assertFails(setDoc(doc(learnerAcme(), 'catalog/prod-new'), { name: 'Hack', price: 0 }));
  });

  it('a superadmin CAN write a catalog product', async () => {
    await assertSucceeds(
      setDoc(doc(superadmin(), 'catalog/prod-super'), { name: 'New Product', price: 49 }),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Enrollment self-write
// ---------------------------------------------------------------------------
describe('Firestore rules — enrollment self-write', () => {
  beforeEach(async () => {
    // Seed another user's enrollment so "cannot write other" tests have a doc to target.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme/courses/c1/enrollments/u-other-learner'), {
        uid: 'u-other-learner',
        tenantId: 'acme',
        progress: 0,
      });
    });
  });

  it('a learner CAN create their OWN enrollment with matching tenantId', async () => {
    await assertSucceeds(
      setDoc(doc(learnerAcme(), 'tenants/acme/courses/c1/enrollments/u-learner'), {
        uid: 'u-learner',
        tenantId: 'acme',
        progress: 0,
      }),
    );
  });

  it('a learner CAN update their OWN enrollment with matching tenantId', async () => {
    // Seed own enrollment first.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme/courses/c1/enrollments/u-learner'), {
        uid: 'u-learner',
        tenantId: 'acme',
        progress: 0,
      });
    });
    await assertSucceeds(
      setDoc(
        doc(learnerAcme(), 'tenants/acme/courses/c1/enrollments/u-learner'),
        { uid: 'u-learner', tenantId: 'acme', progress: 50 },
        { merge: true },
      ),
    );
  });

  it('a learner CANNOT create an enrollment without matching tenantId in the written data', async () => {
    await assertFails(
      setDoc(doc(learnerAcme(), 'tenants/acme/courses/c1/enrollments/u-learner'), {
        uid: 'u-learner',
        tenantId: 'bravo', // wrong tenantId
        progress: 0,
      }),
    );
  });

  it("a learner CANNOT write another user's enrollment doc", async () => {
    await assertFails(
      setDoc(doc(learnerAcme(), 'tenants/acme/courses/c1/enrollments/u-other-learner'), {
        uid: 'u-other-learner',
        tenantId: 'acme',
        progress: 100,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. AI conversations isolation
// ---------------------------------------------------------------------------
describe('Firestore rules — AI conversation isolation', () => {
  beforeEach(async () => {
    // Seed another user's conversation message for deny-read test.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme/conversations/u-other-learner/messages/m1'), {
        role: 'user',
        content: 'Hello',
      });
    });
  });

  it('a learner CAN create a message in their OWN conversation thread', async () => {
    await assertSucceeds(
      setDoc(doc(learnerAcme(), 'tenants/acme/conversations/u-learner/messages/m1'), {
        role: 'user',
        content: 'Help me study',
      }),
    );
  });

  it('a learner CAN read their OWN conversation messages', async () => {
    // Seed own message first.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme/conversations/u-learner/messages/m1'), {
        role: 'assistant',
        content: 'Of course!',
      });
    });
    await assertSucceeds(
      getDoc(doc(learnerAcme(), 'tenants/acme/conversations/u-learner/messages/m1')),
    );
  });

  it("a learner CANNOT read another user's conversation messages", async () => {
    await assertFails(
      getDoc(doc(learnerAcme(), 'tenants/acme/conversations/u-other-learner/messages/m1')),
    );
  });

  it("a learner CANNOT create a message in another user's conversation thread", async () => {
    await assertFails(
      setDoc(doc(learnerAcme(), 'tenants/acme/conversations/u-other-learner/messages/m2'), {
        role: 'user',
        content: 'Hijack',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Leaderboard
// ---------------------------------------------------------------------------
describe('Firestore rules — leaderboard', () => {
  beforeEach(async () => {
    // Seed a leaderboard doc so the read test sees a real document.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme/leaderboard/weekly'), {
        entries: [{ uid: 'u-learner', score: 100 }],
      });
    });
  });

  it('an in-tenant learner CAN read the leaderboard', async () => {
    await assertSucceeds(getDoc(doc(learnerAcme(), 'tenants/acme/leaderboard/weekly')));
  });

  it('a learner CANNOT write to the leaderboard', async () => {
    await assertFails(
      setDoc(doc(learnerAcme(), 'tenants/acme/leaderboard/weekly'), {
        entries: [{ uid: 'u-learner', score: 9999 }],
      }),
    );
  });

  it('a tenant_admin CANNOT write to the leaderboard', async () => {
    await assertFails(
      setDoc(doc(adminAcme(), 'tenants/acme/leaderboard/weekly'), {
        entries: [{ uid: 'u-learner', score: 9999 }],
      }),
    );
  });

  it('a superadmin CANNOT write to the leaderboard (client-side write blocked)', async () => {
    await assertFails(
      setDoc(doc(superadmin(), 'tenants/acme/leaderboard/weekly'), {
        entries: [{ uid: 'u-learner', score: 9999 }],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. AI vectors (server-only, all client access denied)
// ---------------------------------------------------------------------------
describe('Firestore rules — AI vectors (server-only)', () => {
  beforeEach(async () => {
    // Seed a vector doc so read-deny tests have a real document.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme/vectors/v1'), {
        embedding: [0.1, 0.2, 0.3],
      });
    });
  });

  it('a learner CANNOT read vectors', async () => {
    await assertFails(getDoc(doc(learnerAcme(), 'tenants/acme/vectors/v1')));
  });

  it('a learner CANNOT write vectors', async () => {
    await assertFails(setDoc(doc(learnerAcme(), 'tenants/acme/vectors/v1'), { embedding: [0.9] }));
  });

  it('a tenant_admin CANNOT read vectors', async () => {
    await assertFails(getDoc(doc(adminAcme(), 'tenants/acme/vectors/v1')));
  });

  it('a tenant_admin CANNOT write vectors', async () => {
    await assertFails(setDoc(doc(adminAcme(), 'tenants/acme/vectors/v1'), { embedding: [0.9] }));
  });

  it('a superadmin CANNOT read vectors (client-side blocked by rules)', async () => {
    await assertFails(getDoc(doc(superadmin(), 'tenants/acme/vectors/v1')));
  });

  it('a superadmin CANNOT write vectors (client-side blocked by rules)', async () => {
    await assertFails(setDoc(doc(superadmin(), 'tenants/acme/vectors/v1'), { embedding: [0.9] }));
  });
});

// ---------------------------------------------------------------------------
// 7. Knowledge base — admin write, learner denied
// ---------------------------------------------------------------------------
describe('Firestore rules — AI knowledge base', () => {
  beforeEach(async () => {
    // Seed a knowledge base doc so read tests see a real document.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'tenants/acme/knowledgeBase/d1'), {
        title: 'Onboarding Guide',
        content: 'Welcome...',
      });
    });
  });

  it('a tenant_admin CAN write a knowledge base doc', async () => {
    await assertSucceeds(
      setDoc(doc(adminAcme(), 'tenants/acme/knowledgeBase/d1'), {
        title: 'Updated Guide',
        content: 'New content',
      }),
    );
  });

  it('a learner CANNOT write a knowledge base doc', async () => {
    await assertFails(
      setDoc(doc(learnerAcme(), 'tenants/acme/knowledgeBase/d1'), {
        title: 'Hacked Guide',
        content: 'Bad content',
      }),
    );
  });

  it('a learner CAN read a knowledge base doc (in-tenant)', async () => {
    await assertSucceeds(getDoc(doc(learnerAcme(), 'tenants/acme/knowledgeBase/d1')));
  });

  it('a tenant_admin CANNOT write a knowledge base doc in another tenant', async () => {
    await assertFails(
      setDoc(doc(adminAcme(), 'tenants/bravo/knowledgeBase/d1'), {
        title: 'Cross-tenant attack',
        content: 'Bad',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 8. LRS statements — learner denied read and write
// ---------------------------------------------------------------------------
describe('Firestore rules — LRS statements', () => {
  beforeEach(async () => {
    // Seed an LRS statement doc so read-deny tests have a real document.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'lrs/s1'), {
        actor: { name: 'u-learner' },
        verb: 'completed',
        object: { id: 'course-1' },
      });
    });
  });

  it('a learner CANNOT read an LRS statement', async () => {
    await assertFails(getDoc(doc(learnerAcme(), 'lrs/s1')));
  });

  it('a learner CANNOT write an LRS statement', async () => {
    await assertFails(
      setDoc(doc(learnerAcme(), 'lrs/s2'), {
        actor: { name: 'u-learner' },
        verb: 'completed',
        object: { id: 'course-99' },
      }),
    );
  });

  it('a tenant_admin CANNOT read an LRS statement', async () => {
    await assertFails(getDoc(doc(adminAcme(), 'lrs/s1')));
  });

  it('a superadmin CAN read an LRS statement', async () => {
    await assertSucceeds(getDoc(doc(superadmin(), 'lrs/s1')));
  });

  it('a superadmin CANNOT write an LRS statement (client-side blocked)', async () => {
    await assertFails(
      setDoc(doc(superadmin(), 'lrs/s-new'), {
        actor: { name: 'u-superadmin' },
        verb: 'completed',
        object: { id: 'course-1' },
      }),
    );
  });
});
