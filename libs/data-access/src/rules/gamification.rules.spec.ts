/**
 * Firestore security-rules tests for the Phase 4 gamification collections
 * (xpEvents, awards, gameResults) in the workspace-root firestore.rules.
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

const XP_EVENT = {
  id: 'evt-1',
  uid: 'learner-1',
  tenantId: 'acme',
  amount: 50,
  reason: 'lesson_completed',
  sourceRef: 'courses/pub-1/lessons/l1',
  at: '2026-06-11T12:00:00.000Z',
};

const AWARD = {
  badgeId: 'first-steps',
  name: 'First Steps',
  description: 'Completed your first course.',
  earnedAt: '2026-06-11T12:00:00.000Z',
  credential: { type: ['VerifiableCredential', 'OpenBadgeCredential'] },
};

const GAME_RESULT = {
  id: 'res-1',
  uid: 'learner-1',
  tenantId: 'acme',
  game: 'hazard-hunter',
  score: 870,
  at: '2026-06-11T12:00:00.000Z',
};

maybe('firestore.rules (gamification)', () => {
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

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
    });

    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // The returned compat instance is accepted by the modular API at runtime.
      const db = ctx.firestore() as unknown as Firestore;
      // XP ledger + awards for an acme learner.
      await setDoc(doc(db, 'tenants/acme/members/learner-1/xpEvents/evt-1'), XP_EVENT);
      await setDoc(doc(db, 'tenants/acme/members/learner-1/awards/first-steps'), AWARD);
      // Game results: one for learner-1, one for another player.
      await setDoc(doc(db, 'tenants/acme/gameResults/res-1'), GAME_RESULT);
      await setDoc(doc(db, 'tenants/acme/gameResults/res-2'), {
        ...GAME_RESULT,
        id: 'res-2',
        uid: 'learner-2',
        game: 'peril',
        won: true,
      });
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  describe('/tenants/{tenantId}/members/{uid}/xpEvents/{eventId}', () => {
    const EVENT_PATH = 'tenants/acme/members/learner-1/xpEvents/evt-1';

    it('allows a member to read their own XP events', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), EVENT_PATH)));
    });

    it("denies another learner reading someone else's XP events", async () => {
      await assertFails(getDoc(doc(acmeLearner2(), EVENT_PATH)));
    });

    it('allows in-tenant authoring roles and superadmin to read any XP events', async () => {
      await assertSucceeds(getDoc(doc(acmeInstructor(), EVENT_PATH)));
      await assertSucceeds(getDoc(doc(acmeAdmin(), EVENT_PATH)));
      await assertSucceeds(getDoc(doc(superadmin(), EVENT_PATH)));
    });

    it('denies cross-tenant and unauthenticated XP event reads', async () => {
      await assertFails(getDoc(doc(globexLearner(), EVENT_PATH)));
      await assertFails(getDoc(doc(anonDb(), EVENT_PATH)));
    });

    it('denies XP event writes for everyone, including the member (Cloud Functions only)', async () => {
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/members/learner-1/xpEvents/evt-new'), XP_EVENT),
      );
      await assertFails(updateDoc(doc(acmeAdmin(), EVENT_PATH), { amount: 9999 }));
      await assertFails(
        setDoc(doc(superadmin(), 'tenants/acme/members/learner-1/xpEvents/evt-root'), XP_EVENT),
      );
      await assertFails(deleteDoc(doc(acmeLearner(), EVENT_PATH)));
    });
  });

  describe('/tenants/{tenantId}/members/{uid}/awards/{badgeId}', () => {
    const AWARD_PATH = 'tenants/acme/members/learner-1/awards/first-steps';

    it('allows a member to read their own awards', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), AWARD_PATH)));
    });

    it("denies another learner reading someone else's awards", async () => {
      await assertFails(getDoc(doc(acmeLearner2(), AWARD_PATH)));
    });

    it('allows in-tenant authoring roles and superadmin to read any awards', async () => {
      await assertSucceeds(getDoc(doc(acmeInstructor(), AWARD_PATH)));
      await assertSucceeds(getDoc(doc(acmeAdmin(), AWARD_PATH)));
      await assertSucceeds(getDoc(doc(superadmin(), AWARD_PATH)));
    });

    it('denies cross-tenant and unauthenticated award reads', async () => {
      await assertFails(getDoc(doc(globexLearner(), AWARD_PATH)));
      await assertFails(getDoc(doc(anonDb(), AWARD_PATH)));
    });

    it('denies award writes for everyone, including the member (Cloud Functions only)', async () => {
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/members/learner-1/awards/on-fire'), AWARD),
      );
      await assertFails(updateDoc(doc(acmeAdmin(), AWARD_PATH), { name: 'Tampered' }));
      await assertFails(deleteDoc(doc(acmeLearner(), AWARD_PATH)));
    });
  });

  describe('/tenants/{tenantId}/gameResults/{resultId}', () => {
    it('allows a player to create their own game result', async () => {
      await assertSucceeds(
        setDoc(doc(acmeLearner(), 'tenants/acme/gameResults/res-own'), {
          ...GAME_RESULT,
          id: 'res-own',
        }),
      );
    });

    it('denies creating a result with a spoofed uid', async () => {
      await assertFails(
        setDoc(doc(acmeLearner2(), 'tenants/acme/gameResults/res-spoof'), {
          ...GAME_RESULT, // uid stays 'learner-1' — not the caller
          id: 'res-spoof',
        }),
      );
    });

    it('denies cross-tenant creates, even with a matching uid field', async () => {
      await assertFails(
        setDoc(doc(globexLearner(), 'tenants/acme/gameResults/res-intruder'), {
          ...GAME_RESULT,
          id: 'res-intruder',
          uid: 'globex-learner',
        }),
      );
    });

    it('denies negative scores and unknown games', async () => {
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/gameResults/res-neg'), {
          ...GAME_RESULT,
          id: 'res-neg',
          score: -10,
        }),
      );
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/gameResults/res-pong'), {
          ...GAME_RESULT,
          id: 'res-pong',
          game: 'pong',
        }),
      );
    });

    it('denies updates and deletes, even by the owner (Cloud Functions only)', async () => {
      await assertFails(
        updateDoc(doc(acmeLearner(), 'tenants/acme/gameResults/res-1'), { score: 999999 }),
      );
      await assertFails(deleteDoc(doc(acmeLearner(), 'tenants/acme/gameResults/res-1')));
    });

    it('allows a player to read their own result, denies reading others', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), 'tenants/acme/gameResults/res-1')));
      await assertFails(getDoc(doc(acmeLearner(), 'tenants/acme/gameResults/res-2')));
    });

    it('allows in-tenant authoring roles and superadmin to read every result', async () => {
      await assertSucceeds(getDoc(doc(acmeInstructor(), 'tenants/acme/gameResults/res-1')));
      await assertSucceeds(getDoc(doc(acmeInstructor(), 'tenants/acme/gameResults/res-2')));
      await assertSucceeds(getDoc(doc(acmeAdmin(), 'tenants/acme/gameResults/res-2')));
      await assertSucceeds(getDoc(doc(superadmin(), 'tenants/acme/gameResults/res-1')));
    });

    it('denies unauthenticated game result reads', async () => {
      await assertFails(getDoc(doc(anonDb(), 'tenants/acme/gameResults/res-1')));
    });
  });
});
