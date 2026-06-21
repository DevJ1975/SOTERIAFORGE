/**
 * Tests for the hand-rolled IndexedDB wrapper.
 *
 * Two environments are exercised:
 *  1. No IndexedDB present (the default in this `node` jest project, and the
 *     real Cloud Functions / SSR runtime) — every method must be a safe no-op
 *     returning empty/undefined and never throw. This is the Node-safety
 *     guarantee that lets `@assurance/shared` be imported by Cloud Functions.
 *  2. A minimal in-memory `IDBFactory` fake installed on `globalThis` — proves
 *     real read/write/delete/clear semantics and that a fresh store instance
 *     (a "reload") sees previously persisted data.
 *
 * jsdom does not ship IndexedDB and `fake-indexeddb` is not a dependency (the
 * workspace forbids adding deps), so the fake below implements exactly the
 * subset of the IndexedDB API the wrapper uses.
 */
import { IndexedDbStore, isIndexedDbAvailable } from './indexed-db';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from './fake-indexed-db.testkit';

describe('IndexedDbStore — no IndexedDB available (Node-safe no-op)', () => {
  it('reports IndexedDB as unavailable', () => {
    expect(isIndexedDbAvailable()).toBe(false);
  });

  it('all methods resolve to safe defaults and never throw', async () => {
    const store = new IndexedDbStore<{ n: number }>('db', 'things');
    await expect(store.get('a')).resolves.toBeUndefined();
    await expect(store.getAll()).resolves.toEqual([]);
    await expect(store.entries()).resolves.toEqual([]);
    await expect(store.count()).resolves.toBe(0);
    await expect(store.put('a', { n: 1 })).resolves.toBeUndefined();
    await expect(store.delete('a')).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
  });
});

describe('IndexedDbStore — with a fake IndexedDB', () => {
  beforeEach(() => installFakeIndexedDb());
  afterEach(() => uninstallFakeIndexedDb());

  it('reports IndexedDB as available', () => {
    expect(isIndexedDbAvailable()).toBe(true);
  });

  it('round-trips a value through put/get', async () => {
    const store = new IndexedDbStore<{ n: number }>('db1', 'things');
    await store.put('a', { n: 42 });
    await expect(store.get('a')).resolves.toEqual({ n: 42 });
  });

  it('getAll / entries / count reflect inserted records', async () => {
    const store = new IndexedDbStore<number>('db2', 'nums');
    await store.put('x', 1);
    await store.put('y', 2);
    await expect(store.count()).resolves.toBe(2);
    await expect(store.getAll()).resolves.toEqual([1, 2]);
    await expect(store.entries()).resolves.toEqual([
      ['x', 1],
      ['y', 2],
    ]);
  });

  it('put replaces an existing key (no duplicate)', async () => {
    const store = new IndexedDbStore<number>('db3', 'nums');
    await store.put('x', 1);
    await store.put('x', 9);
    await expect(store.count()).resolves.toBe(1);
    await expect(store.get('x')).resolves.toBe(9);
  });

  it('delete removes a single key', async () => {
    const store = new IndexedDbStore<number>('db4', 'nums');
    await store.put('x', 1);
    await store.put('y', 2);
    await store.delete('x');
    await expect(store.get('x')).resolves.toBeUndefined();
    await expect(store.count()).resolves.toBe(1);
  });

  it('clear empties the store', async () => {
    const store = new IndexedDbStore<number>('db5', 'nums');
    await store.put('x', 1);
    await store.clear();
    await expect(store.count()).resolves.toBe(0);
  });

  it('a fresh store instance ("reload") sees previously persisted data', async () => {
    const first = new IndexedDbStore<string>('db6', 'kv');
    await first.put('k', 'persisted');

    // Simulate an app reload: brand-new instance, same db/store, same backing
    // store in the fake factory.
    const second = new IndexedDbStore<string>('db6', 'kv');
    await expect(second.get('k')).resolves.toBe('persisted');
  });

  it('isolates records by store name within one database', async () => {
    const a = new IndexedDbStore<number>('db7', 'storeA', 1, ['storeA', 'storeB']);
    const b = new IndexedDbStore<number>('db7', 'storeB', 1, ['storeA', 'storeB']);
    await a.put('k', 1);
    await b.put('k', 2);
    await expect(a.get('k')).resolves.toBe(1);
    await expect(b.get('k')).resolves.toBe(2);
  });
});
