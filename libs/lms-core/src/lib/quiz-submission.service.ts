import { Injectable, PLATFORM_ID, type Signal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { IndexedDbStore, isIndexedDbAvailable } from '@assurance/shared';
import type { QuizGrade, QuizResponse } from '@assurance/shared';

export interface QuizSubmitInput {
  tenantId: string;
  courseId: string;
  moduleId: string;
  quizId: string;
  responses: QuizResponse[];
}

/** Outcome of a submit attempt: either graded now, or queued for later sync. */
export interface QuizSubmitOutcome {
  /** True when the server graded the attempt synchronously. */
  graded: boolean;
  /** Present when `graded` is true. */
  grade?: QuizGrade;
  /** True when the attempt was persisted to the offline outbox for later sync. */
  queued: boolean;
}

/** A submission persisted in the outbox awaiting a successful server call. */
interface OutboxItem {
  id: string;
  input: QuizSubmitInput;
  queuedAt: string;
}

const DB_NAME = 'assurance.offline';
const STORE_NAME = 'quiz-outbox';

function outboxKey(input: QuizSubmitInput): string {
  // One pending submission per attempt scope; a re-submit replaces the prior.
  return `${input.tenantId}:${input.courseId}:${input.moduleId}:${input.quizId}`;
}

/**
 * Submits a quiz attempt to the server-authoritative `submitQuiz` Cloud Function
 * (MO-08).
 *
 * Grading stays **server-authoritative** — the outbox merely *defers the
 * callable*; it never grades locally. When the device is offline or the callable
 * rejects, the attempt is persisted to an IndexedDB outbox (via the shared
 * {@link IndexedDbStore}) and retried on the `window` `online` event and on
 * startup. The reconciled grade from the eventual successful call is delivered
 * to registered listeners.
 *
 * Back-compat: {@link submit} retains its original signature/behaviour (resolves
 * to a {@link QuizGrade}, rejects on transport error) so existing callers/tests
 * are unaffected. New offline-tolerant callers use {@link submitWithOutbox}.
 */
@Injectable({ providedIn: 'root' })
export class QuizSubmissionService {
  private readonly fns = inject(Functions, { optional: true });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly outbox = new IndexedDbStore<OutboxItem>(DB_NAME, STORE_NAME);

  /** Number of quiz attempts queued offline awaiting sync. */
  private readonly _pendingCount = signal(0);
  readonly pendingCount: Signal<number> = this._pendingCount.asReadonly();

  /** Listeners notified when a queued attempt is graded on later sync. */
  private readonly reconcileListeners = new Set<(quizId: string, grade: QuizGrade) => void>();

  constructor() {
    if (this.isBrowser) {
      void this.refreshCount();
      // Startup flush: drain any attempts persisted in a prior session.
      void this.flushOutbox();
      window.addEventListener('online', () => void this.flushOutbox());
    }
  }

  /**
   * Original transport: submit and return the authoritative grade. Throws on
   * transport error (unchanged behaviour). Prefer {@link submitWithOutbox} for
   * offline tolerance.
   */
  submit(input: QuizSubmitInput): Promise<QuizGrade> {
    if (!this.fns) {
      return Promise.reject(new Error('Functions unavailable'));
    }
    return httpsCallable<QuizSubmitInput, QuizGrade>(
      this.fns,
      'submitQuiz',
    )(input).then((r) => r.data);
  }

  /**
   * Offline-tolerant submit. If online and the callable succeeds, returns the
   * grade. If offline or the callable rejects, persists the attempt to the
   * outbox and returns `{ graded:false, queued:true }` so the UI can show
   * "Submitted — will sync when online".
   */
  async submitWithOutbox(input: QuizSubmitInput): Promise<QuizSubmitOutcome> {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    if (!offline && this.fns) {
      try {
        const grade = await this.submit(input);
        return { graded: true, grade, queued: false };
      } catch {
        // Fall through to queue for retry.
      }
    }

    await this.enqueue(input);
    return { graded: false, queued: true };
  }

  /**
   * Register a callback invoked when a previously-queued attempt is graded by a
   * later successful sync (so the player can reconcile the displayed grade).
   * Returns an unsubscribe function.
   */
  onReconciled(listener: (quizId: string, grade: QuizGrade) => void): () => void {
    this.reconcileListeners.add(listener);
    return () => this.reconcileListeners.delete(listener);
  }

  /** Attempt to send every queued submission; drained ones are removed. */
  async flushOutbox(): Promise<void> {
    if (!this.fns || !isIndexedDbAvailable()) return;
    const items = await this.outbox.getAll();
    for (const item of items) {
      try {
        const grade = await this.submit(item.input);
        await this.outbox.delete(item.id).catch(() => undefined);
        for (const l of this.reconcileListeners) l(item.input.quizId, grade);
      } catch {
        // Keep for the next flush; stop early if we look offline again.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      }
    }
    await this.refreshCount();
  }

  private async enqueue(input: QuizSubmitInput): Promise<void> {
    const id = outboxKey(input);
    const item: OutboxItem = { id, input, queuedAt: new Date().toISOString() };
    try {
      await this.outbox.put(id, item);
    } catch {
      // IndexedDB unavailable/quota — surface count optimistically; the attempt
      // is not lost to the caller (it gets `queued:true`) but cannot persist
      // across reloads in this degraded environment.
    }
    await this.refreshCount();
  }

  private async refreshCount(): Promise<void> {
    if (!isIndexedDbAvailable()) {
      this._pendingCount.set(0);
      return;
    }
    this._pendingCount.set(await this.outbox.count());
  }
}
