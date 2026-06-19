import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { ReCaptchaV3Provider, initializeAppCheck, provideAppCheck } from '@angular/fire/app-check';

/**
 * Firebase App Check wiring (SOC 2 CC6 — anti-abuse / attestation).
 *
 * App Check attests that traffic originates from your genuine app, blocking
 * scripted abuse of Firestore / callable functions. It is **opt-in and
 * demo-safe**: unless a real reCAPTCHA v3 **site key** is configured, this
 * provider is a complete no-op — nothing is initialized and nothing is
 * enforced. That keeps the local emulator demo (which has no site key) working
 * unchanged.
 *
 * Production setup (see SECURITY.md):
 *   1. Register each app in the Firebase console with reCAPTCHA v3 and obtain a
 *      site key.
 *   2. Expose the key to the browser, e.g. `window.__FORGE_APPCHECK_SITE_KEY__`
 *      (injected at deploy time), and enforce App Check on Firestore + Functions
 *      in the console.
 *   3. App Check then initializes automatically via `provideForgeFirebase`.
 */

declare global {
  interface Window {
    /** Production-only reCAPTCHA v3 site key. Absent in dev/emulator. */
    __FORGE_APPCHECK_SITE_KEY__?: string;
    /** Optional debug token for local App Check testing (never in prod). */
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  }
}

/** Read the configured App Check site key, or `undefined` when unset. */
export function resolveAppCheckSiteKey(explicitKey?: string): string | undefined {
  if (explicitKey && explicitKey.trim().length > 0) {
    return explicitKey.trim();
  }
  if (typeof window !== 'undefined') {
    const fromWindow = window.__FORGE_APPCHECK_SITE_KEY__;
    if (typeof fromWindow === 'string' && fromWindow.trim().length > 0) {
      return fromWindow.trim();
    }
  }
  return undefined;
}

/**
 * Returns App Check providers when a site key is configured, or an empty
 * provider set (no-op) otherwise. Safe to spread unconditionally into the
 * Firebase bootstrap — in dev/emulator with no key it adds nothing.
 *
 * @param siteKey Optional explicit reCAPTCHA v3 site key. Falls back to
 *   `window.__FORGE_APPCHECK_SITE_KEY__`.
 */
export function provideForgeAppCheck(siteKey?: string): EnvironmentProviders {
  const resolvedKey = resolveAppCheckSiteKey(siteKey);

  // DEMO-SAFE: no key (local/emulator/dev) -> do not initialize or enforce.
  if (!resolvedKey) {
    return makeEnvironmentProviders([]);
  }

  return makeEnvironmentProviders([
    provideAppCheck(() =>
      initializeAppCheck(undefined, {
        provider: new ReCaptchaV3Provider(resolvedKey),
        isTokenAutoRefreshEnabled: true,
      }),
    ),
  ]);
}
