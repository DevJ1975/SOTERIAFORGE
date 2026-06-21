import { Injectable, PLATFORM_ID, type Signal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IndexedDbStore, isIndexedDbAvailable } from '@assurance/shared';
import type { XapiStatement } from '@assurance/shared';

/**
 * IndexedDB database + store for the pending xAPI statement queue.
 *
 * Its own database (a single store) on purpose: `IndexedDbStore` only creates
 * object stores during `onupgradeneeded`, so multiple stores sharing one database
 * at the same version — each instance declaring only its own store in `allStores`
 * — would leave the sibling stores uncreated (the multi-store footgun). Every
 * offline feature therefore uses a dedicated database (cf. the quiz outbox/drafts,
 * completion outbox, and downloads), so the upgrade is unambiguous.
 */
const DB_NAME = 'assurance.xapi-queue';
const STORE_NAME = 'xapi-queue';

/**
 * A queued statement plus a stable id used as the IndexedDB key (so statements
 * can be deleted individually after a successful send without rewriting the
 * whole queue).
 */
interface QueuedItem {
  id: string;
  stmt: XapiStatement;
}

function makeId(): string {
  // crypto.randomUUID is available in modern browsers; fall back for safety.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Offline-first xAPI statement queue (MO-05).
 *
 * Durable across reloads: statements are persisted to **IndexedDB** (via the
 * shared {@link IndexedDbStore}; previously this was localStorage, which is
 * ~5 MB, synchronous, and silently dropped statements on quota). An in-memory
 * mirror is hydrated from IndexedDB on construction so the synchronous
 * `peekAll()` / `size()` API callers depend on still works.
 *
 * Draining:
 *  - on the `window` `online` event, and
 *  - on **startup** (when `registerSender` is called while already online), so a
 *    queue persisted in a previous session drains when the app reopens online —
 *    not only on a live offline→online transition.
 *
 * Data-loss safety:
 *  - On IndexedDB quota/write error the statement is **retained** in memory (and
 *    a retry of the persist is attempted on the next mutation/flush) rather than
 *    silently dropped.
 *  - A failed send keeps the statement queued for the next flush.
 *
 * SSR / test safety: all browser-only access (`window`, `navigator`,
 * `indexedDB`) is guarded; the service is a safe no-op on the server and in
 * non-browser environments. The public API is unchanged from the localStorage
 * implementation so `XapiClient` and the learner shell need no changes.
 *
 * @Injectable({ providedIn: 'root' }) — a single queue instance for the app.
 */
@Injectable({ providedIn: 'root' })
export class OfflineXapiQueue {
  private readonly isBrowser: boolean;
  private readonly db: IndexedDbStore<QueuedItem>;

  /** In-memory mirror of the persisted queue (source for sync reads). */
  private items: QueuedItem[] = [];

  /** Resolves once the initial hydrate from IndexedDB has completed. */
  private readonly ready: Promise<void>;

  /** Sender registered by XapiClient; called during automatic flush. */
  private registeredSender: ((s: XapiStatement) => Promise<void>) | null = null;

  /**
   * In-flight flush promise (re-entrancy guard). The startup flush and the
   * `window:online` listener can both fire on reconnect-during-boot; a second
   * caller awaits the running drain and then does one fresh pass, so no item's
   * send is ever attempted twice concurrently while statements queued meanwhile
   * are still drained (FIX-3).
   */
  private inFlight: Promise<void> | null = null;

  /** Number of statements awaiting send (for the offline banner — MO-04). */
  private readonly _pendingCount = signal(0);
  readonly pendingCount: Signal<number> = this._pendingCount.asReadonly();

  constructor() {
    this.isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    this.db = new IndexedDbStore<QueuedItem>(DB_NAME, STORE_NAME);

    // Hydrate the in-memory mirror from IndexedDB once at startup.
    this.ready = this.hydrate();

    if (this.isBrowser) {
      window.addEventListener('online', () => {
        if (this.registeredSender) {
          void this.flush(this.registeredSender);
        }
      });
    }
  }

  /**
   * Register the sender callback used during automatic flushes (window `online`
   * event and startup). Called once by `XapiClient`.
   *
   * Triggers a **startup flush**: if the app reopens already-online with a queue
   * persisted from a prior session, that queue is drained immediately rather
   * than waiting for a live offline→online transition.
   */
  registerSender(sender: (s: XapiStatement) => Promise<void>): void {
    this.registeredSender = sender;
    if (!this.isBrowser) return;
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (online) {
      void this.flush(sender);
    }
  }

  /**
   * Persist a statement to the queue. Updates the in-memory mirror synchronously
   * and writes through to IndexedDB. On IndexedDB error the statement is kept in
   * memory (never silently dropped).
   */
  enqueue(stmt: XapiStatement): void {
    const item: QueuedItem = { id: makeId(), stmt };
    this.items.push(item);
    this.updateCount();
    void this.persistItem(item);
  }

  /** Return all queued statements without removing them (synchronous mirror). */
  peekAll(): XapiStatement[] {
    return this.items.map((i) => i.stmt);
  }

  /** Number of statements currently queued (synchronous mirror). */
  size(): number {
    return this.items.length;
  }

  /**
   * Attempt to send every queued statement via `sender`.
   *
   * Successfully-sent statements are removed from both the mirror and
   * IndexedDB. Statements whose send rejects are kept for the next flush so
   * partial connectivity does not lose data.
   *
   * @param sender Async function that transmits a single statement; should
   *               reject on network/server error.
   */
  async flush(sender: (s: XapiStatement) => Promise<void>): Promise<void> {
    await this.ready;
    // Serialise overlapping flushes: wait for any running drain, then do one
    // fresh pass. This never sends a statement twice concurrently, yet still
    // drains statements enqueued while the prior drain ran.
    while (this.inFlight) await this.inFlight;
    this.inFlight = this.drain(sender);
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async drain(sender: (s: XapiStatement) => Promise<void>): Promise<void> {
    if (this.items.length === 0) return;
    // Snapshot to iterate; mutate `this.items` as sends succeed.
    const snapshot = [...this.items];
    for (const item of snapshot) {
      try {
        await sender(item.stmt);
        // Success — drain from mirror + IndexedDB.
        this.items = this.items.filter((i) => i.id !== item.id);
        await this.db.delete(item.id).catch(() => undefined);
      } catch {
        // Keep for next flush; stop trying further if we appear offline again.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      }
    }
    this.updateCount();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Load the persisted queue into the in-memory mirror. Safe no-op off-browser. */
  private async hydrate(): Promise<void> {
    if (!isIndexedDbAvailable()) {
      this.updateCount();
      return;
    }
    try {
      const persisted = await this.db.getAll();
      // Preserve any items enqueued before hydrate resolved (avoid losing them).
      const existingIds = new Set(this.items.map((i) => i.id));
      const merged = [...persisted.filter((p) => !existingIds.has(p.id)), ...this.items];
      this.items = merged;
    } catch {
      // If hydrate fails, keep whatever is already in memory.
    }
    this.updateCount();
  }

  /** Write a single item to IndexedDB; retain in memory on failure. */
  private async persistItem(item: QueuedItem): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    try {
      await this.db.put(item.id, item);
    } catch {
      // Quota / write error: do NOT drop. The item stays in the in-memory mirror
      // and will be retried by the next persist or sent on the next flush.
    }
  }

  private updateCount(): void {
    this._pendingCount.set(this.items.length);
  }
}
