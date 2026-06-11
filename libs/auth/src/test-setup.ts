import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

// Firebase Auth's Node entrypoint references fetch/Headers/Response at module
// load time; jsdom provides none of them. Unit tests never hit the network,
// so minimal stand-ins are enough to let the SDK load.
const globals = globalThis as unknown as Record<string, unknown>;
globals['fetch'] ??= () => Promise.reject(new Error('fetch is not available in unit tests'));
globals['Headers'] ??= class {};
globals['Response'] ??= class {};

setupZoneTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});
