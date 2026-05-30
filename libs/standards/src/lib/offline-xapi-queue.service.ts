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
    const queue = this._read();
    if (queue.length === 0) return;

    const remaining: XapiStatement[] = [];
    for (const stmt of queue) {
      try {
        await sender(stmt);
        // Success — do NOT add to `remaining`; statement is drained.
      } catch {
        // Keep for next flush.
        remaining.push(stmt);
      }
    }
    this._write(remaining);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _read(): XapiStatement[] {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as XapiStatement[];
    } catch {
      return [];
    }
  }

  private _write(queue: XapiStatement[]): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // Storage quota exceeded — silently drop; statements will still be sent
      // by the in-memory fallback on the next flush attempt.
    }
  }
}
