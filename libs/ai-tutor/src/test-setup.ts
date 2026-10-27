// Firebase auth is imported by the shared API interceptor; unit tests do not use the network.
const g = globalThis as Record<string, unknown>;
g['fetch'] ??= () => Promise.reject(new Error('fetch is not available in unit tests'));
g['Headers'] ??= class Headers {};
g['Request'] ??= class Request {};
g['Response'] ??= class Response {};
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();
