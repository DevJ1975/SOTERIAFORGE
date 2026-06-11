import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * Phase 2 exit-criteria journey: an instructor authors and publishes a course
 * in the admin app, then a learner takes it in the learner app — all against
 * the local Firebase emulators.
 *
 * Lifecycle (single command: `npx nx e2e learner-e2e`):
 *  - globalSetup boots the auth+firestore emulators (reusing already-running
 *    ones) and idempotently seeds users/claims/tenant/member docs.
 *  - webServer starts BOTH apps: admin on :4201 and learner on :4200.
 *  - globalTeardown stops the emulators, but only if this run started them.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  globalSetup: './src/global-setup',
  globalTeardown: './src/global-teardown',
  // The journey is one serial story across two apps: a single worker, no parallelism.
  fullyParallel: false,
  workers: 1,
  // Network-y steps (emulator round-trips, lazy route chunks) get generous budgets.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Same report folder as the Nx preset, but never auto-serve it: the preset
  // default ('on-failure') would block `nx e2e` forever after a failure.
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: '../../dist/.playwright/apps/learner-e2e/playwright-report', open: 'never' },
    ],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /*
   * Both apps are started before the tests (and reused when already up).
   *
   * serve-static (production build + file server) instead of `nx serve`: the
   * Vite dev-server's dependency prebundler emits TWO copies of the Firestore
   * SDK (one inlined into @angular/fire/firestore, one as the firebase/firestore
   * entry imported by the workspace libs), so every Firestore call fails with
   * "Expected first argument to collection() to be ... FirebaseFirestore".
   * The real esbuild production bundle has a single SDK copy and works.
   */
  webServer: [
    {
      command: 'npx nx serve-static admin --port 4201',
      url: 'http://localhost:4201',
      reuseExistingServer: true,
      timeout: 300_000,
      cwd: workspaceRoot,
    },
    {
      command: 'npx nx serve-static learner --port 4200',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 300_000,
      cwd: workspaceRoot,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
