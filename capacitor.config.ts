import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wrapper for the Soteria FORGE learner app.
 *
 * `webDir` points at the learner's browser build output
 * (`npx nx build learner` → `dist/apps/learner/browser`). After building the
 * web app, run `npx cap add android` / `npx cap add ios` to generate the native
 * projects (kept out of git — see `.gitignore`), then `npm run cap:sync` to copy
 * the web assets and native plugins in. See `docs/OFFLINE_VIDEO.md`.
 */
const config: CapacitorConfig = {
  appId: 'com.soteriaforge.learner',
  appName: 'Soteria FORGE',
  webDir: 'dist/apps/learner/browser',
};

export default config;
