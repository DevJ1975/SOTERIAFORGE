import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

// Firebase Auth's Node entrypoint (pulled in via @angular/fire/functions)
// references fetch/Headers/Response at module load time; jsdom provides none
// of them. Unit tests never hit the network, so minimal stand-ins are enough
// to let the SDK load. Mirrors libs/auth/src/test-setup.ts.
const globals = globalThis as unknown as Record<string, unknown>;
globals['fetch'] ??= () => Promise.reject(new Error('fetch is not available in unit tests'));
globals['Headers'] ??= class {};
globals['Response'] ??= class {};

setupZoneTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});
