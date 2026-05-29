// Polyfill the Fetch API globals so @angular/fire -> @firebase/auth's Node entry
// can be imported under jsdom. Tests never hit the network.
const g = globalThis as Record<string, unknown>;
g['fetch'] ??= () => Promise.reject(new Error('fetch is not available in unit tests'));
g['Headers'] ??= class Headers {};
g['Request'] ??= class Request {};
g['Response'] ??= class Response {};

import 'jest-preset-angular/setup-jest';
