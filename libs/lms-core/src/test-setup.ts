import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

// Same polyfill as apps/learner: the Forge API clients import @assurance/auth, whose
// @firebase/auth Node entry references the Fetch globals at module-eval time. Unit
// tests never hit the network; these only need to be defined.
const g = globalThis as Record<string, unknown>;
g['fetch'] ??= () => Promise.reject(new Error('fetch is not available in unit tests'));
g['Headers'] ??= class Headers {};
g['Request'] ??= class Request {};
g['Response'] ??= class Response {};
