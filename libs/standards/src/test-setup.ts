const g = globalThis as Record<string, unknown>;
g['fetch'] ??= () => Promise.reject(new Error('fetch is not available in unit tests'));
g['Headers'] ??= class Headers {};
g['Request'] ??= class Request {};
g['Response'] ??= class Response {};
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();
