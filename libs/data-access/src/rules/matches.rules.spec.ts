/**
 * Firestore security-rules tests for the Phase 4 PERIL! realtime match
 * collections (/tenants/{t}/matches + .../events) in the workspace-root
 * firestore.rules.
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
import { arrayUnion, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const maybe = process.env['FIRESTORE_EMULATOR_HOST'] ? describe : describe.skip;

const RULES_PATH = join(__dirname, '../../../../firestore.rules');
const PROJECT_ID = 'demo-rules-test';

const NOW = '2026-06-11T12:00:00.000Z';

const player = (uid: string) => ({ uid, displayName: `Player ${uid}`, joinedAt: NOW });

const MATCH = {
  id: 'match-1',
  tenantId: 'acme',
  hostUid: 'learner-1',
  status: 'open',
  createdAt: NOW,
  players: [player('learner-1')],
  seed: 424242,
  updatedAt: NOW,
};

const EVENT = {
  id: 'evt-1',
  matchId: 'match-1',
  uid: 'learner-1',
  at: NOW,
  type: 'buzz',
  payload: { latencyMs: 350 },
};

maybe('firestore.rules (peril matches)', () => {
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
      await setDoc(doc(db, 'tenants/acme/matches/match-1'), MATCH);
      await setDoc(doc(db, 'tenants/acme/matches/match-1/events/evt-1'), EVENT);
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  describe('/tenants/{tenantId}/matches/{matchId}', () => {
    const MATCH_PATH = 'tenants/acme/matches/match-1';

    it('allows tenant members and superadmin to read matches', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner(), MATCH_PATH)));
      await assertSucceeds(getDoc(doc(acmeLearner2(), MATCH_PATH)));
      await assertSucceeds(getDoc(doc(superadmin(), MATCH_PATH)));
    });

    it('denies cross-tenant and unauthenticated match reads', async () => {
      await assertFails(getDoc(doc(globexLearner(), MATCH_PATH)));
      await assertFails(getDoc(doc(anonDb(), MATCH_PATH)));
    });

    it('allows a member to create a match they host, starting open', async () => {
      await assertSucceeds(
        setDoc(doc(acmeLearner(), 'tenants/acme/matches/match-own'), {
          ...MATCH,
          id: 'match-own',
        }),
      );
    });

    it('denies creating a match with a spoofed hostUid', async () => {
      await assertFails(
        setDoc(doc(acmeLearner2(), 'tenants/acme/matches/match-spoof'), {
          ...MATCH, // hostUid stays 'learner-1' — not the caller
          id: 'match-spoof',
        }),
      );
    });

    it('denies creating a match whose initial status is not open', async () => {
      await assertFails(
        setDoc(doc(acmeLearner(), 'tenants/acme/matches/match-hot'), {
          ...MATCH,
          id: 'match-hot',
          status: 'playing',
        }),
      );
    });

    it('denies cross-tenant creates, even when self-hosted', async () => {
      await assertFails(
        setDoc(doc(globexLearner(), 'tenants/acme/matches/match-intruder'), {
          ...MATCH,
          id: 'match-intruder',
          hostUid: 'globex-learner',
          players: [player('globex-learner')],
        }),
      );
    });

    it('allows a second tenant member to join (players update, host unchanged)', async () => {
      await assertSucceeds(
        updateDoc(doc(acmeLearner2(), MATCH_PATH), {
          players: arrayUnion(player('learner-2')),
          updatedAt: '2026-06-11T12:00:05.000Z',
        }),
      );
    });

    it('allows the host to flip the status (open -> playing -> finished)', async () => {
      await assertSucceeds(
        updateDoc(doc(acmeLearner(), MATCH_PATH), {
          status: 'playing',
          updatedAt: '2026-06-11T12:00:10.000Z',
        }),
      );
    });

    it('denies any update that mutates hostUid', async () => {
      await assertFails(updateDoc(doc(acmeLearner2(), MATCH_PATH), { hostUid: 'learner-2' }));
    });

    it('denies cross-tenant and unauthenticated updates', async () => {
      await assertFails(updateDoc(doc(globexLearner(), MATCH_PATH), { status: 'abandoned' }));
      await assertFails(updateDoc(doc(anonDb(), MATCH_PATH), { status: 'abandoned' }));
    });

    it('denies a non-host member deleting the match', async () => {
      await assertFails(deleteDoc(doc(acmeLearner2(), MATCH_PATH)));
    });

    it('allows the host (and superadmin) to delete a match', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore() as unknown as Firestore;
        await setDoc(doc(db, 'tenants/acme/matches/match-del-host'), {
          ...MATCH,
          id: 'match-del-host',
        });
        await setDoc(doc(db, 'tenants/acme/matches/match-del-root'), {
          ...MATCH,
          id: 'match-del-root',
        });
      });
      await assertSucceeds(deleteDoc(doc(acmeLearner(), 'tenants/acme/matches/match-del-host')));
      await assertSucceeds(deleteDoc(doc(superadmin(), 'tenants/acme/matches/match-del-root')));
    });
  });

  describe('/tenants/{tenantId}/matches/{matchId}/events/{eventId}', () => {
    const EVENT_PATH = 'tenants/acme/matches/match-1/events/evt-1';

    it('allows tenant members and superadmin to read events', async () => {
      await assertSucceeds(getDoc(doc(acmeLearner2(), EVENT_PATH)));
      await assertSucceeds(getDoc(doc(superadmin(), EVENT_PATH)));
    });

    it('denies cross-tenant and unauthenticated event reads', async () => {
      await assertFails(getDoc(doc(globexLearner(), EVENT_PATH)));
      await assertFails(getDoc(doc(anonDb(), EVENT_PATH)));
    });

    it('allows a member to append an event as themselves', async () => {
      await assertSucceeds(
        setDoc(doc(acmeLearner2(), 'tenants/acme/matches/match-1/events/evt-own'), {
          ...EVENT,
          id: 'evt-own',
          uid: 'learner-2',
          type: 'answer',
          payload: { optionIndex: 2, thinkMs: 1200 },
        }),
      );
    });

    it('denies appending an event with a spoofed uid', async () => {
      await assertFails(
        setDoc(doc(acmeLearner2(), 'tenants/acme/matches/match-1/events/evt-spoof'), {
          ...EVENT, // uid stays 'learner-1' — not the caller
          id: 'evt-spoof',
        }),
      );
    });

    it('denies cross-tenant event creates, even with a matching uid field', async () => {
      await assertFails(
        setDoc(doc(globexLearner(), 'tenants/acme/matches/match-1/events/evt-intruder'), {
          ...EVENT,
          id: 'evt-intruder',
          uid: 'globex-learner',
        }),
      );
    });

    it('denies event updates and deletes for everyone (append-only log)', async () => {
      await assertFails(updateDoc(doc(acmeLearner(), EVENT_PATH), { payload: { latencyMs: 1 } }));
      await assertFails(deleteDoc(doc(acmeLearner(), EVENT_PATH)));
      await assertFails(updateDoc(doc(superadmin(), EVENT_PATH), { type: 'state' }));
    });
  });
});
