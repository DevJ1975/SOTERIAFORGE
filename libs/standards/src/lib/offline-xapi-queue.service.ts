import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { XapiStatement } from '@assurance/shared';

/**
 * Key used in localStorage for the pending xAPI statement queue.
 *
 * TODO: Migrate to IndexedDB for higher-volume queues (localStorage is
 * limited to ~5 MB and is synchronous). The service API surface (`enqueue`,
 * `peekAll`, `flush`) can remain identical; only the persistence layer needs
 * to change.
 */
const QUEUE_KEY = 'forge.xapi.queue';

/**
 * Offline-first xAPI statement queue.
 *
 * When the learner goes offline (or a network send fails), statements are
 * persisted to `localStorage` under `forge.xapi.queue`. When connectivity is
 * restored a `window` `online` event triggers an automatic flush.
 *
 * SSR / test safety:
 *  - All `window`, `navigator`, and `localStorage` access is guarded by
 *    `isPlatformBrowser` or `typeof` checks so the service is a no-op in
 *    server-side and non-browser test environments where those globals are
 *    absent. (jsdom used by Jest *does* expose `localStorage`, so queue logic
 *    is fully exercisable in unit tests.)
 *
 * @Injectable({ providedIn: 'root' }) — a single queue instance for the app.
 */
@Injectable({ providedIn: 'root' })
export class OfflineXapiQueue {
  private readonly isBrowser: boolean;
  /** Sender registered by XapiClient; called during automatic flush. */
  private registeredSender: ((s: XapiStatement) => Promise<void>) | null = null;
  /** Guards against overlapping flushes (e.g. concurrent `online` events). */
  private flushing = false;
  /**
   * In-memory fallback used only after a `localStorage` quota error, so queued
   * statements are not silently dropped within the session. (Cross-reload
   * durability still requires the IndexedDB migration noted above.)
   */
  private memory: XapiStatement[] | null = null;

  constructor() {
    this.isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    if (this.isBrowser) {
      window.addEventListener('online', () => {
        if (this.registeredSender) {
          void this.flush(this.registeredSender);
        }
      });
    }
  }

  /**
   * Register the sender callback that will be used during automatic
   * (window `online` event) flushes. Called once by `XapiClient`.
   */
  registerSender(sender: (s: XapiStatement) => Promise<void>): void {
    this.registeredSender = sender;
  }

  /**
   * Persist a statement to the queue.
   * No-op when `localStorage` is unavailable.
   */
  enqueue(stmt: XapiStatement): void {
    if (typeof localStorage === 'undefined') return;
    const queue = this._read();
    queue.push(stmt);
    this._write(queue);
  }

  /**
   * Return all queued statements without removing them.
   */
  peekAll(): XapiStatement[] {
    if (typeof localStorage === 'undefined') return [];
    return this._read();
  }

  /**
   * Number of statements currently queued.
   */
  size(): number {
    return this.peekAll().length;
  }

  /**
   * Attempt to send every queued statement via `sender`.
   *
   * Statements that send successfully are removed from the queue.
   * Statements whose send rejects are kept for the next flush attempt so
   * partial connectivity does not lose data.
   *
   * @param sender Async function that transmits a single statement; should
   *               reject on network/server error.
   */
  async flush(sender: (s: XapiStatement) => Promise<void>): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    if (this.flushing) return; // an in-flight flush will drain the queue
    this.flushing = true;
    try {
      const snapshot = this._read();
      if (snapshot.length === 0) return;

      const failed: XapiStatement[] = [];
      for (const stmt of snapshot) {
        try {
          await sender(stmt);
          // Success — drained.
        } catch {
          failed.push(stmt);
        }
      }

      // Re-read so statements `enqueue`d during the awaited sends (which append
      // to the end) are preserved rather than overwritten by the stale snapshot.
      const current = this._read();
      const addedDuringFlush = current.slice(snapshot.length);
      this._write([...failed, ...addedDuringFlush]);
    } finally {
      this.flushing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _read(): XapiStatement[] {
    // Once in fallback mode, the in-memory queue is authoritative for the session.
    if (this.memory !== null) return [...this.memory];
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as XapiStatement[];
    } catch {
      return [];
    }
  }

  private _write(queue: XapiStatement[]): void {
    if (this.memory !== null) {
      this.memory = [...queue];
      return;
    }
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // Storage quota exceeded — switch to an in-memory queue for the rest of
      // the session so statements are retained (not dropped) and can still be
      // flushed. Durability across reloads needs the IndexedDB migration.
      this.memory = [...queue];
    }
  }
}
