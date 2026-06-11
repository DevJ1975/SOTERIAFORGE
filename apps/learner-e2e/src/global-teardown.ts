import { stopEmulators } from './emulators';

/**
 * Playwright global teardown: stop the Firebase emulators, but only when this
 * run started them (pre-existing emulators are left running for dev loops).
 */
export default async function globalTeardown(): Promise<void> {
  await stopEmulators();
}
