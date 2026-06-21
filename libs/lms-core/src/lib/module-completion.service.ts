import { Injectable, PLATFORM_ID, type Signal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { IndexedDbStore, isIndexedDbAvailable } from '@assurance/shared';

export interface CompleteModuleInput {
  tenantId: string;
  courseId: string;
  moduleId: string;
  score?: number;
}

export interface CompleteModuleResult {
  ok: boolean;
  progressPct: number;
  completed: boolean;
  firstCompletion: boolean;
}

/** Outcome of a completion attempt: either confirmed now, or durably queued. */
export interface CompleteModuleOutcome {
  /** True when the server confirmed the completion synchronously. */
  confirmed: boolean;
  /** Present when `confirmed` is true. */
  result?: CompleteModuleResult;
  /**
   * True when the completion was either confirmed OR durably persisted to the
   * offline outbox for later sync. Callers use this to decide whether it is safe
   * to emit the dependent xAPI `completed` statement (MO-10): only when the
   * authoritative completion is guaranteed-eventually-consistent.
   */
  durable: boolean;
}

/** A completion persisted in the outbox awaiting a successful server call. */
interface OutboxItem {
  id: string;
  input: CompleteModuleInput;
  queuedAt: string;
}

/**
 * Own database with a single store — the footgun-safe pattern shared by every
 * offline feature here.
 *
 * Why a dedicated database: `IndexedDbStore` only creates object stores during
 * `onupgradeneeded`, so multiple stores sharing one database at the same version
 * (each instance declaring only its own store) would leave siblings uncreated
 * (the multi-store footgun). Each offline feature — xAPI queue, quiz outbox, quiz
 * drafts, this completion outbox, and downloads — therefore uses its own database,
 * so there is exactly one store per database and every upgrade is unambiguous.
 */
const DB_NAME = 'assurance.completion-outbox';
const STORE_NAME = 'completion-outbox';

function outboxKey(input: CompleteModuleInput): string {
  // One pending completion per module scope; a re-complete replaces the prior.
  return `${input.tenantId}:${input.courseId}:${input.moduleId}`;
}

/**
 * Reports non-quiz module completion to the server-authoritative `completeModule`
 * function, which recomputes progress and grants XP/badges/streak (anti-cheat).
 * The client never decides rewards.
 *
 * Offline durability (MO-10): callables are NOT covered by Firestore offline
 * persistence (MO-01), so an offline `complete()` simply fails — and historically
 * the failure was swallowed while the xAPI `completed` statement was still emitted,
 * diverging the LRS ("completed") from the authoritative LMS (no record).
 * {@link completeWithOutbox} closes that gap: when offline or the callable
 * rejects, the completion is persisted to an IndexedDB outbox (via the shared
 * {@link IndexedDbStore}) and retried on the `window` `online` event and on
 * startup. The reconciled {@link CompleteModuleResult} is delivered to registered
 * listeners. Back-compat: {@link complete} retains its original behaviour.
 */
@Injectable({ providedIn: 'root' })
export class ModuleCompletionService {
  private readonly fns = inject(Functions, { optional: true });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly outbox = new IndexedDbStore<OutboxItem>(DB_NAME, STORE_NAME);

  /** Number of completions queued offline awaiting sync. */
  private readonly _pendingCount = signal(0);
  readonly pendingCount: Signal<number> = this._pendingCount.asReadonly();

  /** Listeners notified when a queued completion is confirmed on later sync. */
  private readonly reconcileListeners = new Set<
    (input: CompleteModuleInput, result: CompleteModuleResult) => void
  >();

  /**
   * In-flight flush promise (re-entrancy guard). The startup flush and the
   * `window:online` listener can both fire on reconnect-during-boot; a second
   * caller awaits the running drain and then does one fresh pass, so no item's
   * callable is ever sent twice concurrently while items queued meanwhile are
   * still drained (FIX-3).
   */
  private inFlight: Promise<void> | null = null;

  constructor() {
    if (this.isBrowser) {
      void this.refreshCount();
      // Startup flush: drain any completions persisted in a prior session.
      void this.flushOutbox();
      window.addEventListener('online', () => void this.flushOutbox());
    }
  }

  /**
   * Original behaviour: report completion to the server and return the result, or
   * `null` if Functions is unavailable or the callable rejects. Tolerant of
   * failure (no throw to UI). Prefer {@link completeWithOutbox} for offline
   * durability.
   */
  async complete(input: CompleteModuleInput): Promise<CompleteModuleResult | null> {
    if (!this.fns) return null;
    try {
      return await this.callComplete(input);
    } catch {
      return null;
    }
  }

  /**
   * Offline-durable completion (MO-10). If online and the callable succeeds,
   * returns `{ confirmed:true, durable:true, result }`. If offline or the
   * callable rejects, persists the completion to the outbox and returns
   * `{ confirmed:false, durable:true }` (durable because it survives reload and
   * will be retried). Only when persistence itself fails (IndexedDB absent/quota)
   * is `durable` false, so the caller can hold back the dependent xAPI statement.
   */
  async completeWithOutbox(input: CompleteModuleInput): Promise<CompleteModuleOutcome> {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    if (!offline && this.fns) {
      try {
        const result = await this.callComplete(input);
        return { confirmed: true, result, durable: true };
      } catch {
        // Fall through to queue for retry.
      }
    }

    const persisted = await this.enqueue(input);
    return { confirmed: false, durable: persisted };
  }

  /**
   * Register a callback invoked when a previously-queued completion is confirmed
   * by a later successful sync. Returns an unsubscribe function.
   */
  onReconciled(
    listener: (input: CompleteModuleInput, result: CompleteModuleResult) => void,
  ): () => void {
    this.reconcileListeners.add(listener);
    return () => this.reconcileListeners.delete(listener);
  }

  /** Attempt to send every queued completion; drained ones are removed. */
  async flushOutbox(): Promise<void> {
    if (!this.fns || !isIndexedDbAvailable()) return;
    // Serialise overlapping flushes: wait for any running drain, then do one
    // fresh pass. This never sends an item twice concurrently, yet still drains
    // items that were queued while the prior drain ran (its `getAll` is fresh).
    while (this.inFlight) await this.inFlight;
    this.inFlight = this.drain();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async drain(): Promise<void> {
    // A transient IndexedDB rejection must not become an unhandled rejection.
    const items = await this.outbox.getAll().catch(() => [] as OutboxItem[]);
    for (const item of items) {
      try {
        const result = await this.callComplete(item.input);
        await this.outbox.delete(item.id).catch(() => undefined);
        for (const l of this.reconcileListeners) l(item.input, result);
      } catch {
        // Keep for the next flush; stop early if we look offline again.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      }
    }
    await this.refreshCount();
  }

  private callComplete(input: CompleteModuleInput): Promise<CompleteModuleResult> {
    const fns = this.fns;
    if (!fns) return Promise.reject(new Error('Functions unavailable'));
    const call = httpsCallable<CompleteModuleInput, CompleteModuleResult>(fns, 'completeModule');
    return call(input).then((r) => r.data);
  }

  /** Persist a completion to the outbox; returns true when it durably persisted. */
  private async enqueue(input: CompleteModuleInput): Promise<boolean> {
    const id = outboxKey(input);
    const item: OutboxItem = { id, input, queuedAt: new Date().toISOString() };
    let persisted = false;
    try {
      await this.outbox.put(id, item);
      persisted = isIndexedDbAvailable();
    } catch {
      // IndexedDB unavailable/quota — cannot guarantee durability across reload.
      persisted = false;
    }
    await this.refreshCount();
    return persisted;
  }

  private async refreshCount(): Promise<void> {
    if (!isIndexedDbAvailable()) {
      this._pendingCount.set(0);
      return;
    }
    // A transient IndexedDB rejection must not become an unhandled rejection.
    this._pendingCount.set(await this.outbox.count().catch(() => 0));
  }
}
