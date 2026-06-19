import { effect, inject, Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { ProgressService } from '@forge/lms-core';
import {
  deviceId,
  emit,
  type ProgressEvent,
  staggerDelayMs,
  withRetry,
} from '@forge/shared';
import { NetworkStatusService } from './network-status.service';

/** Preferences key holding the ordered JSON array of queued {@link ProgressEvent}. */
const QUEUE_KEY = 'forge.progress-queue.v1';

/** Preferences key holding the persisted monotonic per-device `clientSeq` counter. */
const SEQ_KEY = 'forge.progress-seq.v1';

/**
 * Stagger window (ms) over which reconnecting devices spread their flush. Keyed
 * by {@link deviceId} so each device lands at a stable offset instead of every
 * device hammering the backend the instant connectivity returns.
 */
const FLUSH_WINDOW_MS = 5_000;

/**
 * The slice of `ProgressService` (Lane B) this queue depends on. Lane B's
 * contract (§8) adds optional `idempotencyKey`/`deviceId`/`clientSeq` params to
 * `setLessonProgress`/`completeCourse` (default-generated when omitted). We pass
 * the event's OWN values on every attempt so a replay re-writes the same event
 * document id and collapses — exactly-once, replay-safe.
 *
 * Declared locally so this lane type-checks before Lane B lands; the real
 * `ProgressService` is structurally assignable to it at integration.
 */
export interface ProgressWriter {
  setLessonProgress(
    tenantId: string,
    courseId: string,
    uid: string,
    completedLessonIds: string[],
    totalLessons: number,
    opts?: ProgressWriteOptions,
  ): Promise<unknown>;
  completeCourse(
    tenantId: string,
    courseId: string,
    uid: string,
    score?: number,
    opts?: ProgressWriteOptions,
  ): Promise<unknown>;
}

/** Idempotency metadata forwarded to the backend so each attempt is replay-safe. */
export interface ProgressWriteOptions {
  idempotencyKey: string;
  deviceId: string;
  clientSeq: number;
}

/** Fields the caller supplies; the queue fills the rest deterministically. */
export type EnqueueInput = Pick<ProgressEvent, 'uid' | 'tenantId' | 'courseId' | 'kind'> &
  Partial<Pick<ProgressEvent, 'lessonId' | 'score'>>;

/** Outcome of a {@link ProgressSyncQueue.flush}: how many events synced vs stayed queued. */
export interface FlushResult {
  synced: number;
  failed: number;
}

/**
 * Durable, replay-safe outbox for learner progress.
 *
 * Progress is recorded as append-only {@link ProgressEvent}s (not enrollment
 * patches) in a `@capacitor/preferences`-backed queue that survives reloads,
 * crashes, and offline periods on both web and native. Each event carries a
 * client-generated `idempotencyKey` (= the backend event document id) and a
 * monotonic per-device `clientSeq`; flushing sends every queued event through
 * the injected {@link ProgressService} with the SAME idempotencyKey on every
 * attempt, so reconnect storms collapse to a single write per event.
 *
 * An event leaves the durable index ONLY after its backend write resolves; a
 * failed write stays queued for the next flush. Reconnect (offline→online) and
 * app-resume both trigger a flush.
 */
@Injectable({ providedIn: 'root' })
export class ProgressSyncQueue {
  private readonly progress = inject(ProgressService) as unknown as ProgressWriter;
  private readonly network = inject(NetworkStatusService);

  /** Serialises flushes so two callers can't drain the same event twice. */
  private flushing?: Promise<FlushResult>;

  constructor() {
    // Reconnect: flush when connectivity returns (false→true). The effect also
    // runs on the initial `true`; flushing an empty queue is a cheap no-op.
    let wasOnline = this.network.online();
    effect(() => {
      const online = this.network.online();
      if (online && !wasOnline) {
        void this.flush();
      }
      wasOnline = online;
    });
  }

  /**
   * Append a progress event to the durable queue. Fills `idempotencyKey` (a
   * fresh url-safe id), `deviceId`, the next monotonic `clientSeq`, and
   * `occurredAt`/`createdAt` (now). Returns the fully-formed event.
   */
  async enqueue(input: EnqueueInput): Promise<ProgressEvent> {
    const now = new Date().toISOString();
    const clientSeq = await this.nextClientSeq();
    const event: ProgressEvent = {
      idempotencyKey: newIdempotencyKey(),
      uid: input.uid,
      tenantId: input.tenantId,
      courseId: input.courseId,
      kind: input.kind,
      ...(input.lessonId === undefined ? {} : { lessonId: input.lessonId }),
      ...(input.score === undefined ? {} : { score: input.score }),
      clientSeq,
      occurredAt: now,
      deviceId: deviceId(),
      createdAt: now,
    };
    const queue = await this.read();
    queue.push(event);
    await this.write(queue);
    emit('progress_enqueued', {
      idempotencyKey: event.idempotencyKey,
      kind: event.kind,
      clientSeq: event.clientSeq,
      pending: queue.length,
    });
    return event;
  }

  /**
   * Attempt to drain the queue to the backend. Staggered by device, retrying
   * only transient errors per attempt. Each event is removed from the durable
   * index only after its write resolves; failures stay queued. Concurrent
   * callers share one in-flight drain (no double-send).
   */
  flush(): Promise<FlushResult> {
    this.flushing ??= this.runFlush().finally(() => {
      this.flushing = undefined;
    });
    return this.flushing;
  }

  /** Convenience alias for app lifecycle hooks (e.g. resume / app-active). */
  flushOnResume(): Promise<FlushResult> {
    return this.flush();
  }

  /** Number of events still durably queued. */
  async pending(): Promise<number> {
    return (await this.read()).length;
  }

  /** Drop every queued event (does NOT reset the monotonic clientSeq). */
  async clear(): Promise<void> {
    await Preferences.remove({ key: QUEUE_KEY });
  }

  // ---- internals -----------------------------------------------------------

  private async runFlush(): Promise<FlushResult> {
    const queue = await this.read();
    if (queue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    const delay = staggerDelayMs(deviceId(), FLUSH_WINDOW_MS);
    if (delay > 0) {
      await sleep(delay);
    }

    let synced = 0;
    let failed = 0;
    for (const event of queue) {
      try {
        await withRetry(() => this.send(event));
        // Remove from the durable index ONLY after the write resolves. Re-read
        // so a concurrent enqueue during the await is preserved.
        await this.removeByKey(event.idempotencyKey);
        synced++;
      } catch {
        // Stays queued for the next flush — no progress is ever lost.
        failed++;
      }
    }

    emit('progress_flush', { synced, failed, staggerMs: delay });
    return { synced, failed };
  }

  /** Route a single event to the matching ProgressService write, replay-safe. */
  private async send(event: ProgressEvent): Promise<void> {
    const opts: ProgressWriteOptions = {
      idempotencyKey: event.idempotencyKey,
      deviceId: event.deviceId,
      clientSeq: event.clientSeq,
    };
    if (event.kind === 'course_completed') {
      await this.progress.completeCourse(
        event.tenantId,
        event.courseId,
        event.uid,
        event.score,
        opts,
      );
      return;
    }
    // lesson_completed / score_recorded both advance lesson-level progress; the
    // backend derives progressPct from the event stream under the clientSeq
    // guard. The lesson id (when present) rides along on the event.
    await this.progress.setLessonProgress(
      event.tenantId,
      event.courseId,
      event.uid,
      event.lessonId ? [event.lessonId] : [],
      0,
      opts,
    );
  }

  private async nextClientSeq(): Promise<number> {
    const { value } = await Preferences.get({ key: SEQ_KEY });
    const current = value ? Number.parseInt(value, 10) : 0;
    const next = Number.isFinite(current) && current >= 0 ? current + 1 : 1;
    await Preferences.set({ key: SEQ_KEY, value: String(next) });
    return next;
  }

  private async read(): Promise<ProgressEvent[]> {
    const { value } = await Preferences.get({ key: QUEUE_KEY });
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as ProgressEvent[]) : [];
    } catch {
      return [];
    }
  }

  private async write(queue: ProgressEvent[]): Promise<void> {
    await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
  }

  /** Remove a single event by its idempotency key, re-reading to avoid races. */
  private async removeByKey(idempotencyKey: string): Promise<void> {
    const queue = await this.read();
    const next = queue.filter((e) => e.idempotencyKey !== idempotencyKey);
    if (next.length !== queue.length) {
      await this.write(next);
    }
  }
}

/**
 * A fresh, path-safe idempotency key matching the shared `idempotencyKey`
 * primitive (`/^[A-Za-z0-9_-]{8,200}$/`). Uses `crypto.randomUUID` with the
 * hyphens kept (url/path-safe) and falls back to a random string off-crypto.
 */
function newIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
