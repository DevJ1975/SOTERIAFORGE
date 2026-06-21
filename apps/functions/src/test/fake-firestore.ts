/**
 * Dependency-free in-memory fakes for unit-testing Cloud Functions without the
 * emulator or `firebase-functions-test`. Supports the Firestore/Auth surface the
 * callables actually use: doc get/set/create/update, dotted-path `snap.get`,
 * `{ merge: true }`, transactions, batches, and basic collection `where` queries.
 *
 * Excluded from the app build via tsconfig.app.json (`src/test/**`).
 */

type Data = Record<string, unknown>;

function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

type Sentinel = { __op: 'arrayUnion' | 'arrayRemove' | 'delete'; vals?: unknown[] };
function isSentinel(v: unknown): v is Sentinel {
  return isPlainObject(v) && typeof (v as Record<string, unknown>)['__op'] === 'string';
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Deep-merges `patch` into `base`, resolving FieldValue sentinels. */
function applyWrite(base: Data, patch: Data): Data {
  const out: Data = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (isSentinel(v)) {
      const cur = Array.isArray(out[k]) ? (out[k] as unknown[]) : [];
      if (v.__op === 'delete') delete out[k];
      else if (v.__op === 'arrayUnion')
        out[k] = [...cur, ...(v.vals ?? []).filter((x) => !cur.some((c) => eq(c, x)))];
      else if (v.__op === 'arrayRemove')
        out[k] = cur.filter((c) => !(v.vals ?? []).some((x) => eq(c, x)));
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = applyWrite(out[k] as Data, v);
    } else {
      out[k] = clone(v);
    }
  }
  return out;
}

class FakeSnapshot {
  constructor(
    readonly id: string,
    private readonly _data: Data | undefined,
  ) {}
  get exists(): boolean {
    return this._data !== undefined;
  }
  data(): Data | undefined {
    return this._data ? clone(this._data) : undefined;
  }
  get(field: string): unknown {
    return clone(getPath(this._data, field));
  }
  get ref(): { path: string } {
    return { path: this.id };
  }
}

class FakeDocRef {
  constructor(
    private readonly store: Map<string, Data>,
    readonly path: string,
  ) {}
  private get docId(): string {
    const parts = this.path.split('/');
    return parts[parts.length - 1];
  }
  async get(): Promise<FakeSnapshot> {
    return new FakeSnapshot(this.docId, this.store.get(this.path));
  }
  async set(data: Data, opts?: { merge?: boolean }): Promise<void> {
    const base = opts?.merge ? ((this.store.get(this.path) as Data) ?? {}) : {};
    this.store.set(this.path, applyWrite(base, data));
  }
  async create(data: Data): Promise<void> {
    if (this.store.has(this.path)) {
      throw Object.assign(new Error(`ALREADY_EXISTS: ${this.path}`), { code: 6 });
    }
    this.store.set(this.path, applyWrite({}, data));
  }
  async update(data: Data): Promise<void> {
    if (!this.store.has(this.path)) {
      throw Object.assign(new Error(`NOT_FOUND: ${this.path}`), { code: 5 });
    }
    this.store.set(this.path, applyWrite(this.store.get(this.path) as Data, data));
  }
  async delete(): Promise<void> {
    this.store.delete(this.path);
  }
}

class FakeQuery {
  constructor(
    private readonly store: Map<string, Data>,
    private readonly prefix: string,
    private readonly filters: Array<[string, string, unknown]> = [],
  ) {}
  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(this.store, this.prefix, [...this.filters, [field, op, value]]);
  }
  async get(): Promise<{ docs: FakeSnapshot[]; empty: boolean; size: number }> {
    const docs: FakeSnapshot[] = [];
    for (const [path, data] of this.store) {
      const rel = path.slice(this.prefix.length);
      // Direct children of the collection only (no deeper subcollections).
      if (!path.startsWith(this.prefix) || rel.includes('/')) continue;
      const ok = this.filters.every(([f, , v]) => getPath(data, f) === v);
      if (ok) docs.push(new FakeSnapshot(rel, data));
    }
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

export class FakeFirestore {
  readonly store = new Map<string, Data>();

  doc(path: string): FakeDocRef {
    return new FakeDocRef(this.store, path);
  }
  collection(path: string): FakeQuery {
    return new FakeQuery(this.store, `${path}/`);
  }
  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return fn(new FakeTransaction());
  }
  batch(): FakeWriteBatch {
    return new FakeWriteBatch();
  }

  /** Seed a document directly (test setup helper). */
  seed(path: string, data: Data): void {
    this.store.set(path, clone(data));
  }
}

class FakeTransaction {
  get(ref: FakeDocRef): Promise<FakeSnapshot> {
    return ref.get();
  }
  set(ref: FakeDocRef, data: Data, opts?: { merge?: boolean }): FakeTransaction {
    void ref.set(data, opts);
    return this;
  }
  update(ref: FakeDocRef, data: Data): FakeTransaction {
    void ref.update(data);
    return this;
  }
  create(ref: FakeDocRef, data: Data): FakeTransaction {
    void ref.create(data);
    return this;
  }
  delete(ref: FakeDocRef): FakeTransaction {
    void ref.delete();
    return this;
  }
}

class FakeWriteBatch {
  private readonly ops: Array<() => Promise<void>> = [];
  set(ref: FakeDocRef, data: Data, opts?: { merge?: boolean }): void {
    this.ops.push(() => ref.set(data, opts));
  }
  delete(ref: FakeDocRef): void {
    this.ops.push(() => ref.delete());
  }
  async commit(): Promise<void> {
    for (const op of this.ops) await op();
  }
}

/** Mirrors firebase-admin/firestore FieldValue (resolved by applyWrite). */
export const FakeFieldValue = {
  arrayUnion: (...vals: unknown[]) => ({ __op: 'arrayUnion' as const, vals }),
  arrayRemove: (...vals: unknown[]) => ({ __op: 'arrayRemove' as const, vals }),
  delete: () => ({ __op: 'delete' as const }),
};

/** Minimal in-memory Firebase Auth fake (incl. GCIP tenant manager). */
export function makeFakeAuth(seedUsers: Record<string, { customClaims?: Data }> = {}) {
  const users = new Map<string, { customClaims?: Data }>(Object.entries(clone(seedUsers)));
  const api = {
    setCustomUserClaims: jest.fn(async (uid: string, claims: Data) => {
      const u = users.get(uid) ?? {};
      u.customClaims = clone(claims);
      users.set(uid, u);
    }),
    getUser: jest.fn(async (uid: string) => users.get(uid) ?? { customClaims: undefined }),
    updateUser: jest.fn(async (uid: string, patch: Data) => {
      const u = users.get(uid) ?? {};
      users.set(uid, { ...u, ...patch });
      return users.get(uid);
    }),
    tenantManager: () => ({ authForTenant: (_tenantId: string) => api }),
    _users: users,
  };
  return api;
}

/** Mirrors firebase-functions HttpsError (carries a `.code`). */
export class FakeHttpsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpsError';
  }
}

/** Minimal Express-style response capture for onRequest handlers. */
export function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload?: unknown) {
      this.body = payload;
      return this;
    },
    json(payload?: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}
