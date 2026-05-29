// Polyfill the Fetch API globals so @angular/fire -> @firebase/auth's Node entry
// can be imported under jsdom (it references these at module-eval time). Unit
// tests never hit the network; these only need to be defined.
const g = globalThis as Record<string, unknown>;
g['fetch'] ??= () => Promise.reject(new Error('fetch is not available in unit tests'));
g['Headers'] ??= class Headers {};
g['Request'] ??= class Request {};
g['Response'] ??= class Response {};

import 'jest-preset-angular/setup-jest';
