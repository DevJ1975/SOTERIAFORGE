/**
 * Cloud Storage security-rules tests for the workspace-root storage.rules.
 *
 * These run only when a Storage emulator is reachable
 * (FIREBASE_STORAGE_EMULATOR_HOST or STORAGE_EMULATOR_HOST set — emulators:exec
 * exports both), e.g.:
 *
 *   npx firebase emulators:exec --only storage --project demo-rules-test \
 *     "npx nx test data-access --testPathPattern=storage --skip-nx-cache"
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
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';

const STORAGE_HOST =
  process.env['FIREBASE_STORAGE_EMULATOR_HOST'] ?? process.env['STORAGE_EMULATOR_HOST'];

const maybe = STORAGE_HOST ? describe : describe.skip;

const RULES_PATH = join(__dirname, '../../../../storage.rules');
const PROJECT_ID = 'demo-rules-test';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Accepts `host:port` and `http://host:port` (STORAGE_EMULATOR_HOST form). */
function parseEmulatorHost(value: string): { host: string; port: number } {
  const [host, port] = value.replace(/^https?:\/\//, '').split(':');
  return { host, port: Number(port) };
}

maybe('storage.rules', () => {
  jest.setTimeout(20_000);

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
  const globexInstructor = () =>
    authedStorage('globex-instructor', { role: 'instructor', tenantId: 'globex' });
  const superadmin = () => authedStorage('root-1', { role: 'superadmin' });

  const SEED_PATH = 'tenants/acme/media/image/1-seed.png';

  function upload(storage: FirebaseStorage, path: string, contentType = 'image/png') {
    return uploadBytes(ref(storage, path), PNG_BYTES, { contentType });
  }

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        ...parseEmulatorHost(STORAGE_HOST as string),
      },
    });

    await testEnv.clearStorage();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // The returned compat instance is accepted by the modular API at runtime.
      const storage = ctx.storage() as unknown as FirebaseStorage;
      await upload(storage, SEED_PATH);
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  describe('reads under /tenants/{tenantId}/media', () => {
    it('allows any signed-in member of the tenant to read tenant media', async () => {
      await assertSucceeds(getBytes(ref(acmeLearner(), SEED_PATH)));
      await assertSucceeds(getBytes(ref(acmeInstructor(), SEED_PATH)));
    });

    it('allows superadmin to read any tenant media', async () => {
      await assertSucceeds(getBytes(ref(superadmin(), SEED_PATH)));
    });

    it('denies cross-tenant media reads', async () => {
      await assertFails(getBytes(ref(globexInstructor(), SEED_PATH)));
    });

    it('denies unauthenticated media reads', async () => {
      await assertFails(getBytes(ref(anonStorage(), SEED_PATH)));
    });
  });

  describe('writes under /tenants/{tenantId}/media', () => {
    it('allows an in-tenant instructor to upload an image', async () => {
      await assertSucceeds(upload(acmeInstructor(), 'tenants/acme/media/image/2-photo.png'));
    });

    it('allows an in-tenant tenant_admin to upload a video', async () => {
      await assertSucceeds(upload(acmeAdmin(), 'tenants/acme/media/video/3-clip.mp4', 'video/mp4'));
    });

    it('denies uploads by learners, even in their own tenant', async () => {
      await assertFails(upload(acmeLearner(), 'tenants/acme/media/image/4-learner.png'));
    });

    it('denies cross-tenant uploads by an instructor of another tenant', async () => {
      await assertFails(upload(globexInstructor(), 'tenants/acme/media/image/5-intruder.png'));
    });

    it('denies uploads whose contentType is not image/* or video/*', async () => {
      await assertFails(
        upload(acmeInstructor(), 'tenants/acme/media/image/6-archive.zip', 'application/zip'),
      );
    });

    it('allows superadmin to upload into any tenant', async () => {
      await assertSucceeds(upload(superadmin(), 'tenants/globex/media/cover/7-root.png'));
    });

    it('denies unauthenticated uploads', async () => {
      await assertFails(upload(anonStorage(), 'tenants/acme/media/image/8-anon.png'));
    });
  });

  describe('deletes under /tenants/{tenantId}/media', () => {
    it('allows in-tenant authoring roles to delete, denies learners and outsiders', async () => {
      const target = 'tenants/acme/media/image/9-todelete.png';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await upload(ctx.storage() as unknown as FirebaseStorage, target);
      });
      await assertFails(deleteObject(ref(acmeLearner(), target)));
      await assertFails(deleteObject(ref(globexInstructor(), target)));
      await assertSucceeds(deleteObject(ref(acmeInstructor(), target)));
    });
  });

  describe('everything else', () => {
    it('denies reads and writes outside /tenants/{tenantId}/media, even for superadmin', async () => {
      await assertFails(upload(superadmin(), 'uploads/rogue.png'));
      await assertFails(upload(acmeInstructor(), 'tenants/acme/exports/report.png'));
      await assertFails(getBytes(ref(superadmin(), 'uploads/rogue.png')));
    });
  });
});
