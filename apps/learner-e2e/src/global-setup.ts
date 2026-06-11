import { startEmulators } from './emulators';
import { seedEmulators } from './seed';

/**
 * Playwright global setup: ensure the Firebase emulators are running, then
 * seed users/claims and tenant/member documents. Both steps are idempotent,
 * so re-running against live emulators (dev loop) is safe.
 */
export default async function globalSetup(): Promise<void> {
  await startEmulators();
  await seedEmulators();
}
