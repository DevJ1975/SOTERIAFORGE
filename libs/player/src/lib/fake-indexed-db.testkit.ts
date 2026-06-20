/**
 * Minimal in-memory IndexedDB fake for unit tests.
 *
 * jsdom does not provide IndexedDB and `fake-indexeddb` is not a workspace
 * dependency (adding deps is forbidden), so this implements exactly the subset
 * of the IndexedDB API consumed by {@link IndexedDbStore}: `open` (with
 * `onupgradeneeded`), `transaction` → `objectStore`, and the store operations
 * `get` / `getAll` / `count` / `put` / `delete` / `clear`, each returning a
 * request-like object whose `onsuccess` / `onerror` fire on the microtask queue.
 *
 * Backing data persists in a module-level map keyed by database name, so a
 * fresh `IndexedDbStore` instance pointing at the same db/store (a simulated
 * "reload") reads previously written records. Call {@link uninstallFakeIndexedDb}
 * in `afterEach` to reset state between tests.
 *
 * NOTE: This file is intentionally NOT exported from the package barrel — it is
 * test-only. Each lib that needs it keeps a local copy to respect Nx module
 * boundaries (a shipped barrel must not carry test fakes).
 */

type StoreData = Map<string, unknown>;

interface FakeDb {
  stores: Map<string, StoreData>;
}

const databases = new Map<string, FakeDb>();

function fireSuccess<T>(req: FakeRequest<T>, result: T): void {
  req.result = result;
  queueMicrotask(() => req.onsuccess?.());
}

class FakeRequest<T> {
  result!: T;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeOpenRequest extends FakeRequest<FakeIDBDatabase> {
  onupgradeneeded: (() => void) | null = null;
}

class FakeObjectStore {
  constructor(private readonly data: StoreData) {}

  get(key: string): FakeRequest<{ key: string; value: unknown } | undefined> {
    const req = new FakeRequest<{ key: string; value: unknown } | undefined>();
    const has = this.data.has(key);
    fireSuccess(req, has ? { key, value: this.data.get(key) } : undefined);
    return req;
  }

  getAll(): FakeRequest<Array<{ key: string; value: unknown }>> {
    const req = new FakeRequest<Array<{ key: string; value: unknown }>>();
    const all = [...this.data.entries()].map(([key, value]) => ({ key, value }));
    fireSuccess(req, all);
    return req;
  }

  count(): FakeRequest<number> {
    const req = new FakeRequest<number>();
    fireSuccess(req, this.data.size);
    return req;
  }

  put(record: { key: string; value: unknown }): FakeRequest<void> {
    const req = new FakeRequest<void>();
    this.data.set(record.key, record.value);
    fireSuccess(req, undefined as unknown as void);
    return req;
  }

  delete(key: string): FakeRequest<void> {
    const req = new FakeRequest<void>();
    this.data.delete(key);
    fireSuccess(req, undefined as unknown as void);
    return req;
  }

  clear(): FakeRequest<void> {
    const req = new FakeRequest<void>();
    this.data.clear();
    fireSuccess(req, undefined as unknown as void);
    return req;
  }
}

class FakeTransaction {
  constructor(private readonly db: FakeDb) {}
  objectStore(name: string): FakeObjectStore {
    let store = this.db.stores.get(name);
    if (!store) {
      store = new Map();
      this.db.stores.set(name, store);
    }
    return new FakeObjectStore(store);
  }
}

class FakeIDBDatabase {
  constructor(private readonly db: FakeDb) {}
  get objectStoreNames(): { contains: (name: string) => boolean } {
    return { contains: (name: string) => this.db.stores.has(name) };
  }
  createObjectStore(name: string): void {
    if (!this.db.stores.has(name)) this.db.stores.set(name, new Map());
  }
  transaction(_storeNames: string | string[], _mode?: string): FakeTransaction {
    return new FakeTransaction(this.db);
  }
}

class FakeIDBFactory {
  open(name: string, _version?: number): FakeOpenRequest {
    const req = new FakeOpenRequest();
    let db = databases.get(name);
    const isNew = !db;
    if (!db) {
      db = { stores: new Map() };
      databases.set(name, db);
    }
    const wrapper = new FakeIDBDatabase(db);
    req.result = wrapper;
    queueMicrotask(() => {
      if (isNew) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  }
}

/** Install the fake on `globalThis.indexedDB`. */
export function installFakeIndexedDb(): void {
  (globalThis as { indexedDB?: unknown }).indexedDB = new FakeIDBFactory();
}

/** Remove the fake and wipe all backing data. */
export function uninstallFakeIndexedDb(): void {
  databases.clear();
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
}
