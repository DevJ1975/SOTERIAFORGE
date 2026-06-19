/**
 * Cloud Storage security-rules tests for the workspace-root storage.rules.
 *
 * These run only when a Storage emulator is reachable
 * (FIREBASE_STORAGE_EMULATOR_HOST set), e.g. via the workspace script:
 *
 *   npm run test:rules
 *     → firebase emulators:exec --only firestore,storage \
 *         "nx test data-access --testPathPattern=rules --skip-nx-cache"
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';

const maybe = process.env['FIREBASE_STORAGE_EMULATOR_HOST'] ? describe : describe.skip;

const RULES_PATH = join(__dirname, '../../../../storage.rules');
const PROJECT_ID = 'demo-rules-test';

// A 1 KB stand-in for a real upload payload.
const SMALL_VIDEO = new Uint8Array(1024);
const VIDEO_META = { contentType: 'video/mp4' };

const ACME_VIDEO = 'tenants/acme/courses/course-1/videos/clip.mp4';
const GLOBEX_VIDEO = 'tenants/globex/courses/course-9/videos/clip.mp4';

maybe('storage.rules', () => {
  let testEnv: RulesTestEnvironment;

  /** Storage handle authenticated with the given uid + custom claims. */
  function authedStorage(uid: string, claims: Record<string, unknown>): FirebaseStorage {
    return testEnv.authenticatedContext(uid, claims).storage() as unknown as FirebaseStorage;
  }

  function anonStorage(): FirebaseStorage {
    return testEnv.unauthenticatedContext().storage() as unknown as FirebaseStorage;
  }

  const acmeLearner = () => authedStorage('learner-1', { role: 'learner', tenantId: 'acme' });
  const acmeInstructor = () =>
    authedStorage('instructor-1', { role: 'instructor', tenantId: 'acme' });
  const acmeAdmin = () => authedStorage('admin-1', { role: 'tenant_admin', tenantId: 'acme' });
  const globexLearner = () =>
    authedStorage('globex-learner', { role: 'learner', tenantId: 'globex' });
  const superadmin = () => authedStorage('root-1', { role: 'superadmin' });

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: { rules: readFileSync(RULES_PATH, 'utf8') },
    });

    await testEnv.clearStorage();
    // Seed one object under acme so read tests have something to fetch.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const storage = ctx.storage() as unknown as FirebaseStorage;
      await uploadBytes(ref(storage, ACME_VIDEO), SMALL_VIDEO, VIDEO_META);
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  describe('reads', () => {
    it('allows a tenant member to read a course video in their tenant', async () => {
      await assertSucceeds(getDownloadURL(ref(acmeLearner(), ACME_VIDEO)));
    });

    it('allows superadmin to read a course video in any tenant', async () => {
      await assertSucceeds(getDownloadURL(ref(superadmin(), ACME_VIDEO)));
    });

    it('denies a cross-tenant member reading another tenant’s video', async () => {
      await assertFails(getDownloadURL(ref(globexLearner(), ACME_VIDEO)));
    });

    it('denies an unauthenticated read', async () => {
      await assertFails(getDownloadURL(ref(anonStorage(), ACME_VIDEO)));
    });
  });

  describe('writes', () => {
    it('allows an authoring role to upload a valid video under the size limit', async () => {
      await assertSucceeds(
        uploadBytes(
          ref(acmeInstructor(), 'tenants/acme/courses/course-1/videos/new.mp4'),
          SMALL_VIDEO,
          VIDEO_META,
        ),
      );
    });

    it('allows a tenant_admin and superadmin to upload a valid video', async () => {
      await assertSucceeds(
        uploadBytes(
          ref(acmeAdmin(), 'tenants/acme/courses/course-1/videos/admin.mp4'),
          SMALL_VIDEO,
          VIDEO_META,
        ),
      );
      await assertSucceeds(
        uploadBytes(
          ref(superadmin(), 'tenants/globex/courses/course-9/videos/root.mp4'),
          SMALL_VIDEO,
          VIDEO_META,
        ),
      );
    });

    it('denies a learner uploading a video', async () => {
      await assertFails(
        uploadBytes(
          ref(acmeLearner(), 'tenants/acme/courses/course-1/videos/learner.mp4'),
          SMALL_VIDEO,
          VIDEO_META,
        ),
      );
    });

    it('denies an unauthenticated upload', async () => {
      await assertFails(
        uploadBytes(
          ref(anonStorage(), 'tenants/acme/courses/course-1/videos/anon.mp4'),
          SMALL_VIDEO,
          VIDEO_META,
        ),
      );
    });

    it('denies an authoring upload into another tenant', async () => {
      await assertFails(uploadBytes(ref(acmeInstructor(), GLOBEX_VIDEO), SMALL_VIDEO, VIDEO_META));
    });

    it('denies a non-video content type even for an authoring role', async () => {
      await assertFails(
        uploadBytes(
          ref(acmeInstructor(), 'tenants/acme/courses/course-1/videos/notes.txt'),
          SMALL_VIDEO,
          {
            contentType: 'text/plain',
          },
        ),
      );
    });

    it('denies an oversize upload (>= 500 MB) even for an authoring role', async () => {
      // The rule caps strictly below 500 MB on `request.resource.size`. We assert
      // the upload is rejected rather than using `assertFails` here: the emulator
      // can surface an oversize transfer as a transport-level error (storage/unknown)
      // instead of a clean permission-denied, but either way the write must fail.
      const oversize = new Uint8Array(500 * 1024 * 1024 + 1);
      await expect(
        uploadBytes(
          ref(acmeInstructor(), 'tenants/acme/courses/course-1/videos/huge.mp4'),
          oversize,
          VIDEO_META,
        ),
      ).rejects.toBeDefined();
    });
  });

  describe('deny-by-default', () => {
    it('denies access to objects outside the course-videos path', async () => {
      await assertFails(
        uploadBytes(ref(acmeAdmin(), 'tenants/acme/secrets/key.mp4'), SMALL_VIDEO, VIDEO_META),
      );
      await assertFails(getDownloadURL(ref(acmeLearner(), 'random/object.mp4')));
    });
  });
});
