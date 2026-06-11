import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST, PROJECT_ID } from './emulators';

/**
 * Emulator seed data for the journey. Claims are normally set by Cloud
 * Functions; for e2e we set them directly with the Admin SDK against the
 * Auth emulator (and the Admin SDK bypasses Firestore rules for the docs).
 */
export const TENANT_ID = 'e2e';
export const PASSWORD = 'e2e-password-1';
export const INSTRUCTOR_EMAIL = 'instructor@e2e.test';
export const LEARNER_EMAIL = 'learner@e2e.test';

type SeedRole = 'instructor' | 'learner';

function isUserNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'auth/user-not-found'
  );
}

/** Create-or-update a user, then (re)assert its custom claims. Idempotent. */
async function ensureUser(
  auth: Auth,
  email: string,
  role: SeedRole,
  displayName: string,
): Promise<string> {
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    await auth.updateUser(uid, { password: PASSWORD, emailVerified: true, displayName });
  } catch (error) {
    if (!isUserNotFound(error)) throw error;
    uid = (await auth.createUser({ email, password: PASSWORD, emailVerified: true, displayName }))
      .uid;
  }
  await auth.setCustomUserClaims(uid, { role, tenantId: TENANT_ID, entitlements: [] });
  return uid;
}

/**
 * Seeds the emulators: instructor + learner users with role/tenant claims,
 * the /tenants/e2e document, and an active member doc for each user (shape
 * per the @forge/shared `tenant` and `member` zod schemas). Safe to re-run.
 */
export async function seedEmulators(): Promise<void> {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = AUTH_EMULATOR_HOST;
  process.env['FIRESTORE_EMULATOR_HOST'] = FIRESTORE_EMULATOR_HOST;

  const app = initializeApp({ projectId: PROJECT_ID }, `learner-e2e-seed-${Date.now()}`);
  try {
    const auth = getAuth(app);
    const db = getFirestore(app);
    const now = new Date().toISOString();

    const [instructorUid, learnerUid] = await Promise.all([
      ensureUser(auth, INSTRUCTOR_EMAIL, 'instructor', 'E2E Instructor'),
      ensureUser(auth, LEARNER_EMAIL, 'learner', 'E2E Learner'),
    ]);

    await db.doc(`tenants/${TENANT_ID}`).set(
      {
        id: TENANT_ID,
        name: 'E2E Tenant',
        status: 'active',
        plan: 'starter',
        branding: { colors: {} },
        createdAt: now,
      },
      { merge: true },
    );

    const memberDoc = (uid: string, role: SeedRole, email: string, displayName: string) => ({
      uid,
      tenantId: TENANT_ID,
      role,
      status: 'active',
      email,
      displayName,
      xp: 0,
      level: 1,
      streakDays: 0,
      createdAt: now,
    });

    await Promise.all([
      db
        .doc(`tenants/${TENANT_ID}/members/${instructorUid}`)
        .set(memberDoc(instructorUid, 'instructor', INSTRUCTOR_EMAIL, 'E2E Instructor'), {
          merge: true,
        }),
      db
        .doc(`tenants/${TENANT_ID}/members/${learnerUid}`)
        .set(memberDoc(learnerUid, 'learner', LEARNER_EMAIL, 'E2E Learner'), { merge: true }),
    ]);

    console.log(
      `[learner-e2e] Seeded tenant '${TENANT_ID}' with instructor ${instructorUid} and learner ${learnerUid}.`,
    );
  } finally {
    await deleteApp(app);
  }
}
