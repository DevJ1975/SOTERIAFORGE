import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ProgressService } from '@forge/lms-core';
import { NetworkStatusService } from './network-status.service';
import { ProgressSyncQueue } from './progress-sync-queue.service';

// --- In-memory @capacitor/preferences mock -----------------------------------
const store = new Map<string, string>();
jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
    remove: jest.fn(async ({ key }: { key: string }) => {
      store.delete(key);
    }),
  },
}));

/** A fake ProgressService recording calls per idempotencyKey. */
class FakeProgress {
  readonly setLessonProgress = jest.fn(async () => undefined);
  readonly completeCourse = jest.fn(async () => undefined);
  /** idempotencyKeys seen by setLessonProgress, to prove exactly-once. */
  readonly lessonKeys: string[] = [];

  constructor() {
    this.setLessonProgress.mockImplementation(
      async (
        _t: unknown,
        _c: unknown,
        _u: unknown,
        _ids: unknown,
        _total: unknown,
        opts?: { idempotencyKey: string },
      ) => {
        if (opts) this.lessonKeys.push(opts.idempotencyKey);
        return undefined;
      },
    );
  }
}

function makeQueue(progress: FakeProgress, online = signal(true)) {
  TestBed.configureTestingModule({
    providers: [
      ProgressSyncQueue,
      { provide: ProgressService, useValue: progress },
      { provide: NetworkStatusService, useValue: { online } },
    ],
  });
  return TestBed.inject(ProgressSyncQueue);
}

describe('ProgressSyncQueue', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    // Real timers but a tiny stagger window keeps flush near-instant; the FNV
    // hash spread is < window so awaits resolve immediately in practice.
  });

  it('enqueue fills idempotencyKey, deviceId, monotonic clientSeq and timestamps', async () => {
    const queue = makeQueue(new FakeProgress());
    const a = await queue.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'lesson_completed',
      lessonId: 'l1',
    });
    const b = await queue.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'lesson_completed',
      lessonId: 'l2',
    });

    expect(a.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,200}$/);
    expect(a.deviceId.length).toBeGreaterThan(0);
    expect(a.occurredAt).toEqual(expect.any(String));
    // Monotonic per-device clientSeq.
    expect(b.clientSeq).toBe(a.clientSeq + 1);
    expect(await queue.pending()).toBe(2);
  });

  it('persists the queue durably so a fresh instance still sees pending events', async () => {
    const first = makeQueue(new FakeProgress());
    await first.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'lesson_completed',
      lessonId: 'l1',
    });
    TestBed.resetTestingModule();

    const second = makeQueue(new FakeProgress());
    expect(await second.pending()).toBe(1);
  });

  it('flush sends an offline-queued event exactly once even across two flush() calls', async () => {
    const offline = signal(false);
    const progress = new FakeProgress();
    const queue = makeQueue(progress, offline);

    // Enqueue while "offline" — nothing is sent yet.
    const event = await queue.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'lesson_completed',
      lessonId: 'l1',
    });
    expect(progress.setLessonProgress).not.toHaveBeenCalled();
    expect(await queue.pending()).toBe(1);

    // Two flushes racing (e.g. reconnect effect + manual resume) must collapse
    // onto ONE in-flight drain so the backend is hit exactly once.
    const [r1, r2] = await Promise.all([queue.flush(), queue.flush()]);

    // Exactly one backend write, with the SAME idempotencyKey it was enqueued with.
    expect(progress.setLessonProgress).toHaveBeenCalledTimes(1);
    expect(progress.lessonKeys).toEqual([event.idempotencyKey]);
    // Both callers share the single drain's result (no double-send).
    expect(r1).toBe(r2);
    expect(r1.synced).toBe(1);
    expect(await queue.pending()).toBe(0);
  });

  it('flush replays the SAME idempotencyKey across attempts and is exactly-once over repeated flushes', async () => {
    const progress = new FakeProgress();
    const queue = makeQueue(progress);
    const event = await queue.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'lesson_completed',
      lessonId: 'l1',
    });

    await queue.flush();
    // A second flush after success must NOT resend — the event left the index.
    await queue.flush();

    expect(progress.setLessonProgress).toHaveBeenCalledTimes(1);
    expect(progress.lessonKeys).toEqual([event.idempotencyKey]);
  });

  it('keeps an event queued when the backend write fails (no progress lost)', async () => {
    const progress = new FakeProgress();
    // Non-retryable failure so withRetry rethrows immediately.
    progress.setLessonProgress.mockRejectedValue(new Error('permission-denied'));
    const queue = makeQueue(progress);

    await queue.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'lesson_completed',
      lessonId: 'l1',
    });
    const result = await queue.flush();

    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
    expect(await queue.pending()).toBe(1);
  });

  it('routes course_completed events to completeCourse', async () => {
    const progress = new FakeProgress();
    const queue = makeQueue(progress);
    await queue.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'course_completed',
    });
    await queue.flush();

    expect(progress.completeCourse).toHaveBeenCalledTimes(1);
    expect(progress.setLessonProgress).not.toHaveBeenCalled();
  });

  it('clear empties the queue', async () => {
    const queue = makeQueue(new FakeProgress());
    await queue.enqueue({
      uid: 'u1',
      tenantId: 'atl-airport',
      courseId: 'c1',
      kind: 'lesson_completed',
      lessonId: 'l1',
    });
    await queue.clear();
    expect(await queue.pending()).toBe(0);
  });
});
