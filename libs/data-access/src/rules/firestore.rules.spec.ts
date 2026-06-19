/**
 * Firestore security-rules tests for the workspace-root firestore.rules.
 *
 * These run only when a Firestore emulator is reachable
 * (FIRESTORE_EMULATOR_HOST set), e.g.:
 *
 *   npx firebase emulators:exec --only firestore --project demo-rules-test \
 *     "npx nx test data-access --testPathPatterns=rules --skip-nx-cache"
 *
 * Without an emulator the suite is skipped so `nx test data-access` stays green.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const maybe = process.env['FIRESTORE_EMULATOR_HOST'] ? describe : describe.skip;

const RULES_PATH = join(__dirname, '../../../../firestore.rules');
const PROJECT_ID = 'demo-rules-test';

const AUDIT = { createdAt: '2024-01-01T00:00:00.000Z' };

maybe('firestore.rules', () => {
  let testEnv: RulesTestEnvironment;

  /** Firestore handle authenticated with the given uid + custom claims. */
  function authedDb(uid: string, claims: Record<string, unknown>): Firestore {
    return testEnv.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
  }

  function anonDb(): Firestore {
    return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
  }

  const acmeLearner = () => authedDb('learner-1', { role: 'learner', tenantId: 'acme' });
  const acmeLearner2 = () => authedDb('learner-2', { role: 'learner', tenantId: 'acme' });
  const acmeInstructor = () => authedDb('instructor-1', { role: 'instructor', tenantId: 'acme' });
  const acmeAdmin = () => authedDb('admin-1', { role: 'tenant_admin', tenantId: 'acme' });
  const globexLearner = () => authedDb('globex-learner', { role: 'learner', tenantId: 'globex' });
  const superadmin = () => authedDb('root-1', { role: 'superadmin' });
  const buyer = () => authedDb('buyer-1', { role: 'b2c_customer', tenantId: 'b2c' });

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
    });

    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // The returned compat instance is accepted by the modular API at runtime.
      const db = ctx.firestore() as unknown as Firestore;
      // Tenants.
      await setDoc(doc(db, 'tenants/acme'), {
        id: 'acme',
        name: 'Acme',
        status: 'active',
        ...AUDIT,
      });
      await setDoc(doc(db, 'tenants/globex'), {
        id: 'globex',
        name: 'Globex',
        status: 'active',
        ...AUDIT,
      });
      // Members.
      await setDoc(doc(db, 'tenants/acme/members/learner-1'), {
        uid: 'learner-1',
        tenantId: 'acme',
        role: 'learner',
        status: 'active',
        email: 'learner-1@acme.test',
        ...AUDIT,
      });
      // Courses.
      await setDoc(doc(db, 'tenants/acme/courses/pub-1'), {
        id: 'pub-1',
        tenantId: 'acme',
        title: 'Published course',
        status: 'published',
        ...AUDIT,
      });
      await setDoc(doc(db, 'tenants/acme/courses/draft-1'), {
        id: 'draft-1',
        tenantId: 'acme',
        title: 'Draft course',
        status: 'draft',
        ...AUDIT,
      });
      await setDoc(doc(db, 'tenants/globex/courses/draft-2'), {
        id: 'draft-2',
        tenantId: 'globex',
        title: 'Globex draft',
        status: 'draft',
        ...AUDIT,
      });
      // Modules.
      await setDoc(doc(db, 'tenants/acme/courses/pub-1/modules/m1'), {
        id: 'm1',
        courseId: 'pub-1',
        tenantId: 'acme',
        title: 'Module 1',
        order: 0,
        contentType: 'video',
        ...AUDIT,
      });
      // Rich player content (CourseDraft) at content/draft.
      await setDoc(doc(db, 'tenants/acme/courses/pub-1/content/draft'), {
        id: 'pub-1',
        title: 'Published course',
        description: 'Player content',
        status: 'published',
        lessons: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      });
      // Enrollments.
      await setDoc(doc(db, 'tenants/acme/courses/pub-1/enrollments/learner-1'), {
        uid: 'learner-1',
        courseId: 'pub-1',
        tenantId: 'acme',
        progressPct: 10,
        completed: false,
        ...AUDIT,
      });
      // Badges + leaderboard.
      await setDoc(doc(db, 'tenants/acme/badges/badge-1'), {
        id: 'badge-1',
        tenantId: 'acme',
        name: 'First Steps',
        ...AUDIT,
      });
      await setDoc(doc(db, 'tenants/acme/leaderboard/weekly'), {
        tenantId: 'acme',
        period: 'weekly',
        entries: [],
        ...AUDIT,
      });
      // B2C.
      await setDoc(doc(db, 'b2c/store/catalog/prod-1'), {
        id: 'prod-1',
        title: 'Forklift Safety',
        grants: { kind: 'course', refId: 'pub-1' },
        stripePriceId: 'price_123',
        mode: 'payment',
        published: true,
        ...AUDIT,
      });
      await setDoc(doc(db, 'b2c/store/customers/buyer-1'), {
        uid: 'buyer-1',
        entitlements: ['prod-1'],
        ...AUDIT,
      });
      // Audit logs (server-written, append-only). A tenant-scoped event for
      // acme and a global (superadmin-only) event with no tenantId.
      await setDoc(doc(db, 'auditLogs/audit-acme-1'), {
        actorUid: 'admin-1',
        actorRole: 'tenant_admin',
        tenantId: 'acme',
        action: 'inviteMember',
        target: 'learner-9',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
      await setDoc(doc(db, 'auditLogs/audit-global-1'), {
        actorUid: 'root-1',
        actorRole: 'superadmin',
        action: 'provisionTenant',
        target: 'newco',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  describe('/tenants/{tenantId}', () => {
    it('denies cross-tenant tenant reads', async () => {
      await assertFails(getDoc(doc(acmeLearner(), 'tenants/globex')));
    });

    it('allows a member to read their own tenant', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), 'tenants/acme')));
    });

    it('allows superadmin to read any tenant', async () => {
      await assertSucceeds(getDoc(doc(superadmin(), 'tenants/acme')));
      await assertSucceeds(getDoc(doc(superadmin(), 'tenants/globex')));
    });

    it('denies tenant writes for non-superadmins, allows superadmin', async () => {
      await assertFails(updateDoc(doc(acmeAdmin(), 'tenants/acme'), { name: 'Acme renamed' }));
      await assertSucceeds(updateDoc(doc(superadmin(), 'tenants/acme'), { name: 'Acme renamed' }));
    });

    it('denies unauthenticated tenant reads', async () => {
      await assertFails(getDoc(doc(anonDb(), 'tenants/acme')));
    });
  });

  describe('/tenants/{tenantId}/members/{uid}', () => {
    it('allows tenant members and superadmin to read the roster', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner2(), 'tenants/acme/members/learner-1')));
      await assertSucceeds(getDoc(doc(superadmin(), 'tenants/acme/members/learner-1')));
    });

    it('denies cross-tenant member reads', async () => {
      await assertFails(getDoc(doc(globexLearner(), 'tenants/acme/members/learner-1')));
    });

    it('denies member writes for everyone, including the member and tenant admin', async () => {
      await assertFails(
        updateDoc(doc(acmeLearner(), 'tenants/acme/members/learner-1'), { displayName: 'Me' }),
      );
      await assertFails(
        updateDoc(doc(acmeAdmin(), 'tenants/acme/members/learner-1'), { role: 'instructor' }),
      );
    });
  });

  describe('/tenants/{tenantId}/courses/{courseId}', () => {
    it('allows a learner to read a published course', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), 'tenants/acme/courses/pub-1')));
    });

    it('denies a learner reading a draft course', async () => {
      await assertFails(getDoc(doc(acmeLearner(), 'tenants/acme/courses/draft-1')));
    });

    it('allows an instructor to read and update a draft course in their tenant', async () => {
      await assertSucceeds(getDoc(doc(acmeInstructor(), 'tenants/acme/courses/draft-1')));
      await assertSucceeds(
        updateDoc(doc(acmeInstructor(), 'tenants/acme/courses/draft-1'), {
          title: 'Draft course v2',
        }),
      );
    });

    it('allows an instructor to create a course in their own tenant', async () => {
      await assertSucceeds(
        setDoc(doc(acmeInstructor(), 'tenants/acme/courses/new-1'), {
          id: 'new-1',
          tenantId: 'acme',
          title: 'New course',
          status: 'draft',
          ...AUDIT,
        }),
      );
    });

    it('denies an instructor reading or writing courses in another tenant', async () => {
      await assertFails(getDoc(doc(acmeInstructor(), 'tenants/globex/courses/draft-2')));
      await assertFails(
        setDoc(doc(acmeInstructor(), 'tenants/globex/courses/intruder-1'), {
          id: 'intruder-1',
          tenantId: 'globex',
          title: 'Intruder',
          status: 'draft',
          ...AUDIT,
        }),
      );
    });

    it('denies course writes whose embedded tenantId does not match the path tenant', async () => {
      await assertFails(
        setDoc(doc(acmeInstructor(), 'tenants/acme/courses/spoof-1'), {
          id: 'spoof-1',
          tenantId: 'globex', // spoofed
          title: 'Spoof',
          status: 'draft',
          ...AUDIT,
        }),
      );
    });

    it('denies course writes by learners', async () => {
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/courses/learner-course'), {
          id: 'learner-course',
          tenantId: 'acme',
          title: 'Nope',
          status: 'draft',
          ...AUDIT,
        }),
      );
    });

    it('allows superadmin to read drafts in any tenant', async () => {
      await assertSucceeds(getDoc(doc(superadmin(), 'tenants/globex/courses/draft-2')));
    });

    it('allows authoring roles to delete a course in their tenant, denies learners', async () => {
      await assertFails(deleteDoc(doc(acmeLearner(), 'tenants/acme/courses/new-1')));
      await assertSucceeds(deleteDoc(doc(acmeAdmin(), 'tenants/acme/courses/new-1')));
    });
  });

  describe('/tenants/{tenantId}/courses/{courseId}/modules/{moduleId}', () => {
    it('allows any tenant member to read modules', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), 'tenants/acme/courses/pub-1/modules/m1')));
    });

    it('denies cross-tenant module reads', async () => {
      await assertFails(getDoc(doc(globexLearner(), 'tenants/acme/courses/pub-1/modules/m1')));
    });

    it('allows authoring roles to write modules; denies learners and spoofed tenantId', async () => {
      await assertSucceeds(
        setDoc(doc(acmeInstructor(), 'tenants/acme/courses/pub-1/modules/m2'), {
          id: 'm2',
          courseId: 'pub-1',
          tenantId: 'acme',
          title: 'Module 2',
          order: 1,
          contentType: 'quiz',
          ...AUDIT,
        }),
      );
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/courses/pub-1/modules/m3'), {
          id: 'm3',
          courseId: 'pub-1',
          tenantId: 'acme',
          title: 'Module 3',
          order: 2,
          contentType: 'video',
          ...AUDIT,
        }),
      );
      await assertFails(
        setDoc(doc(acmeInstructor(), 'tenants/acme/courses/pub-1/modules/m4'), {
          id: 'm4',
          courseId: 'pub-1',
          tenantId: 'globex', // spoofed
          title: 'Module 4',
          order: 3,
          contentType: 'video',
          ...AUDIT,
        }),
      );
    });
  });

  describe('/tenants/{tenantId}/courses/{courseId}/content/{contentId}', () => {
    const CONTENT_PATH = 'tenants/acme/courses/pub-1/content/draft';

    it('allows a tenant member to read the player content draft', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), CONTENT_PATH)));
    });

    it('allows superadmin to read player content in any tenant', async () => {
      await assertSucceeds(getDoc(doc(superadmin(), CONTENT_PATH)));
    });

    it('denies a cross-tenant user reading the player content draft', async () => {
      await assertFails(getDoc(doc(globexLearner(), CONTENT_PATH)));
    });

    it('denies content writes for everyone (Cloud Functions/seed only)', async () => {
      await assertFails(
        setDoc(doc(acmeInstructor(), CONTENT_PATH), {
          id: 'pub-1',
          title: 'Hacked',
          status: 'published',
          lessons: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        }),
      );
      await assertFails(updateDoc(doc(acmeAdmin(), CONTENT_PATH), { title: 'Hacked' }));
    });
  });

  describe('/tenants/{tenantId}/courses/{courseId}/enrollments/{uid}', () => {
    const ENROLLMENT_PATH = 'tenants/acme/courses/pub-1/enrollments/learner-1';

    it('allows the enrollee to read their own enrollment', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), ENROLLMENT_PATH)));
    });

    it("denies another learner reading someone else's enrollment", async () => {
      await assertFails(getDoc(doc(acmeLearner2(), ENROLLMENT_PATH)));
    });

    it('allows instructors and superadmin to read enrollments in the tenant', async () => {
      await assertSucceeds(getDoc(doc(acmeInstructor(), ENROLLMENT_PATH)));
      await assertSucceeds(getDoc(doc(superadmin(), ENROLLMENT_PATH)));
    });

    it('allows the enrollee to create/update their own enrollment in their tenant', async () => {
      await assertSucceeds(
        setDoc(doc(acmeLearner(), 'tenants/acme/courses/pub-1/enrollments/learner-1'), {
          uid: 'learner-1',
          courseId: 'pub-1',
          tenantId: 'acme',
          progressPct: 55,
          completed: false,
          ...AUDIT,
        }),
      );
      await assertSucceeds(updateDoc(doc(acmeLearner(), ENROLLMENT_PATH), { progressPct: 60 }));
    });

    it("denies writing someone else's enrollment or spoofing the uid field", async () => {
      await assertFails(
        setDoc(doc(acmeLearner2(), ENROLLMENT_PATH), {
          uid: 'learner-1',
          courseId: 'pub-1',
          tenantId: 'acme',
          progressPct: 100,
          completed: true,
          ...AUDIT,
        }),
      );
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/courses/pub-1/enrollments/learner-1'), {
          uid: 'learner-2', // uid field must match the doc id
          courseId: 'pub-1',
          tenantId: 'acme',
          progressPct: 0,
          completed: false,
          ...AUDIT,
        }),
      );
    });

    it('denies enrollment deletes, even by the enrollee', async () => {
      await assertFails(deleteDoc(doc(acmeLearner(), ENROLLMENT_PATH)));
    });

    it('denies an enrollment write whose embedded tenantId is spoofed', async () => {
      await assertFails(
        setDoc(doc(acmeLearner(), ENROLLMENT_PATH), {
          uid: 'learner-1',
          courseId: 'pub-1',
          tenantId: 'globex', // spoofed: must match the path tenant
          progressPct: 0,
          completed: false,
          ...AUDIT,
        }),
      );
    });
  });

  describe('/tenants/{tenantId}/badges and /leaderboard', () => {
    it('allows tenant members to read badges and leaderboard, denies outsiders', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), 'tenants/acme/badges/badge-1')));
      await assertSucceeds(getDoc(doc(acmeLearner(), 'tenants/acme/leaderboard/weekly')));
      await assertFails(getDoc(doc(globexLearner(), 'tenants/acme/badges/badge-1')));
      await assertFails(getDoc(doc(globexLearner(), 'tenants/acme/leaderboard/weekly')));
    });

    it('denies badge and leaderboard writes for everyone (Cloud Functions only)', async () => {
      await assertFails(
        updateDoc(doc(acmeAdmin(), 'tenants/acme/badges/badge-1'), { name: 'Renamed' }),
      );
      await assertFails(
        updateDoc(doc(acmeAdmin(), 'tenants/acme/leaderboard/weekly'), { entries: [] }),
      );
    });
  });

  describe('/b2c/store/catalog/{productId}', () => {
    it('allows unauthenticated catalog reads (public storefront)', async () => {
      await assertSucceeds(getDoc(doc(anonDb(), 'b2c/store/catalog/prod-1')));
    });

    it('denies catalog writes for unauthenticated users and non-superadmins', async () => {
      await assertFails(setDoc(doc(anonDb(), 'b2c/store/catalog/prod-2'), { title: 'Hack' }));
      await assertFails(updateDoc(doc(buyer(), 'b2c/store/catalog/prod-1'), { title: 'Hack' }));
    });

    it('allows superadmin to write catalog products', async () => {
      await assertSucceeds(
        setDoc(doc(superadmin(), 'b2c/store/catalog/prod-2'), {
          id: 'prod-2',
          title: 'All Access',
          grants: { kind: 'all_access' },
          stripePriceId: 'price_456',
          mode: 'subscription',
          published: false,
          ...AUDIT,
        }),
      );
    });
  });

  describe('/b2c/store/customers/{uid}', () => {
    it('allows a customer to read only their own doc', async () => {
      await assertSucceeds(getDoc(doc(buyer(), 'b2c/store/customers/buyer-1')));
      await assertFails(
        getDoc(
          doc(
            authedDb('buyer-2', { role: 'b2c_customer', tenantId: 'b2c' }),
            'b2c/store/customers/buyer-1',
          ),
        ),
      );
      await assertFails(getDoc(doc(anonDb(), 'b2c/store/customers/buyer-1')));
    });

    it('denies customer writes even by the owner (Cloud Functions only)', async () => {
      await assertFails(
        updateDoc(doc(buyer(), 'b2c/store/customers/buyer-1'), { entitlements: ['prod-2'] }),
      );
    });
  });

  describe('/auditLogs/{auditId}', () => {
    const ACME_EVENT = 'auditLogs/audit-acme-1';
    const GLOBAL_EVENT = 'auditLogs/audit-global-1';

    it('allows superadmin to read any audit event', async () => {
      await assertSucceeds(getDoc(doc(superadmin(), ACME_EVENT)));
      await assertSucceeds(getDoc(doc(superadmin(), GLOBAL_EVENT)));
    });

    it('allows a tenant_admin to read audit events for their own tenant', async () => {
      await assertSucceeds(getDoc(doc(acmeAdmin(), ACME_EVENT)));
    });

    it('denies a tenant_admin reading global (untenanted) audit events', async () => {
      await assertFails(getDoc(doc(acmeAdmin(), GLOBAL_EVENT)));
    });

    it('denies a tenant_admin reading another tenant’s audit events', async () => {
      await assertFails(
        getDoc(
          doc(authedDb('globex-admin', { role: 'tenant_admin', tenantId: 'globex' }), ACME_EVENT),
        ),
      );
    });

    it('denies non-admin roles (learner, instructor) and anonymous reads', async () => {
      await assertFails(getDoc(doc(acmeLearner(), ACME_EVENT)));
      await assertFails(getDoc(doc(acmeInstructor(), ACME_EVENT)));
      await assertFails(getDoc(doc(anonDb(), ACME_EVENT)));
    });

    it('denies all client writes, even by superadmin (Cloud Functions only)', async () => {
      await assertFails(
        setDoc(doc(superadmin(), 'auditLogs/audit-new'), {
          actorUid: 'root-1',
          actorRole: 'superadmin',
          action: 'setUserRole',
          target: 'x',
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      );
      await assertFails(updateDoc(doc(superadmin(), ACME_EVENT), { action: 'tampered' }));
      await assertFails(deleteDoc(doc(acmeAdmin(), ACME_EVENT)));
    });
  });
});
