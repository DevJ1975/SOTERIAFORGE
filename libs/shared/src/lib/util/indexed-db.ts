/**
 * Tiny, dependency-free IndexedDB key/value wrapper.
 *
 * Why hand-rolled: the workspace forbids adding npm dependencies (so no `idb`),
 * and the offline features (xAPI queue — MO-05; quiz drafts + submission outbox
 * — MO-08) only need a simple keyed store with promise ergonomics.
 *
 * Placement: this lives in `@assurance/shared` (`type:util`) so the three
 * `type:feature` libraries that need durable offline storage — `standards`,
 * `player`, `lms-core` — can all import it without violating Nx module
 * boundaries (feature → util is allowed; the libs cannot depend on each other).
 *
 * Node / SSR safety: `@assurance/shared` is also imported by the Cloud
 * Functions (Node) runtime, so this module must never touch `indexedDB` at the
 * top level. Every method guards `isIndexedDbAvailable()` and resolves to a
 * safe no-op value (empty array / undefined) when IndexedDB is absent, exactly
 * mirroring the SSR-safe pattern used elsewhere in the codebase. The class is
 * therefore safe to instantiate anywhere; it simply does nothing useful off the
 * browser.
 */

/** Stored record shape: an arbitrary JSON-serialisable value under a string key. */
interface KvRecord<V> {
  key: string;
  value: V;
}

/**
 * True when a usable IndexedDB implementation is present (browser only).
 * Guards against SSR/Node (`indexedDB` undefined) and locked-down environments
 * where access throws.
 */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Promisify an IDBRequest. */
function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * A single-object-store key/value collection backed by IndexedDB.
 *
 * Each instance owns one object store inside a database. Multiple stores within
 * the same database are created up-front via {@link IndexedDbStore.open} so that
 * the `onupgradeneeded` handler can declare them all (IndexedDB only allows
 * schema changes during a version upgrade).
 */
export class IndexedDbStore<V = unknown> {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * @param dbName    Database name (namespace).
   * @param storeName Object store within the database this instance manages.
   * @param version   Database version. Bump when adding stores.
   * @param allStores All object stores that should exist in this database. Must
   *                  include `storeName`. Declaring siblings here lets several
   *                  `IndexedDbStore` instances share one database/version
   *                  without clobbering each other's stores on upgrade.
   */
  constructor(
    private readonly dbName: string,
    private readonly storeName: string,
    private readonly version = 1,
    private readonly allStores: readonly string[] = [storeName],
  ) {}

  /** Open (and lazily cache) the database connection. */
  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of this.allStores) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'key' });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    });

    // If opening fails, drop the cached rejection so a later call can retry.
    this.dbPromise.catch(() => {
      this.dbPromise = null;
    });

    return this.dbPromise;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  /** Read a single value by key, or `undefined` if absent / IndexedDB missing. */
  async get(key: string): Promise<V | undefined> {
    if (!isIndexedDbAvailable()) return undefined;
    const store = await this.tx('readonly');
    const rec = await requestToPromise<KvRecord<V> | undefined>(
      store.get(key) as IDBRequest<KvRecord<V> | undefined>,
    );
    return rec?.value;
  }

  /** Read every value in insertion order, or `[]` if IndexedDB is missing. */
  async getAll(): Promise<V[]> {
    if (!isIndexedDbAvailable()) return [];
    const store = await this.tx('readonly');
    const recs = await requestToPromise<KvRecord<V>[]>(store.getAll() as IDBRequest<KvRecord<V>[]>);
    return recs.map((r) => r.value);
  }

  /** Read every [key, value] pair, or `[]` if IndexedDB is missing. */
  async entries(): Promise<Array<[string, V]>> {
    if (!isIndexedDbAvailable()) return [];
    const store = await this.tx('readonly');
    const recs = await requestToPromise<KvRecord<V>[]>(store.getAll() as IDBRequest<KvRecord<V>[]>);
    return recs.map((r) => [r.key, r.value] as [string, V]);
  }

  /** Number of records, or 0 if IndexedDB is missing. */
  async count(): Promise<number> {
    if (!isIndexedDbAvailable()) return 0;
    const store = await this.tx('readonly');
    return requestToPromise<number>(store.count());
  }

  /**
   * Insert or replace a value under `key`. No-op when IndexedDB is missing.
   * Rejects on quota/error so callers can decide whether to retain in memory.
   */
  async put(key: string, value: V): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    const store = await this.tx('readwrite');
    await requestToPromise(store.put({ key, value } satisfies KvRecord<V>));
  }

  /** Delete a single key. No-op when IndexedDB is missing. */
  async delete(key: string): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    const store = await this.tx('readwrite');
    await requestToPromise(store.delete(key));
  }

  /** Remove all records in this store. No-op when IndexedDB is missing. */
  async clear(): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    const store = await this.tx('readwrite');
    await requestToPromise(store.clear());
  }
}
