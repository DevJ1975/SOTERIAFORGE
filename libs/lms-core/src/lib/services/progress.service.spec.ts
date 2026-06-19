import { TestBed } from '@angular/core/testing';
import type { Enrollment } from '@forge/shared';
import { FIRESTORE } from '@forge/data-access';
import { ProgressService } from './progress.service';

const setDocMock = jest.fn();
const runTransactionMock = jest.fn();
jest.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
}));
jest.mock('@forge/data-access', () => ({
  FIRESTORE: new (jest.requireActual('@angular/core').InjectionToken)('forge.firestore'),
  enrollmentDoc: jest.fn(() => ({ __ref: 'enrollment' })),
  enrollmentEventDoc: jest.fn((_db, _t, _c, _u, key: string) => ({ __ref: 'event', key })),
}));

/**
 * An in-memory Firestore stand-in. `runTransaction` is implemented against a
 * single mutable enrollment doc so we can assert the projection (dedupe, the
 * monotonic guard, completed semantics) without an emulator. Concurrency is
 * modelled by serializing transactions (the real txn would retry on contention).
 */
function makeTx(store: { enrollment?: Enrollment }) {
  return {
    get: jest.fn(async () => ({
      exists: () => store.enrollment !== undefined,
      data: () => store.enrollment as Enrollment,
    })),
    set: jest.fn((_ref: unknown, value: Enrollment) => {
      store.enrollment = value;
    }),
  };
}

describe('ProgressService', () => {
  let service: ProgressService;
  let store: { enrollment?: Enrollment };

  beforeEach(() => {
    setDocMock.mockReset();
    runTransactionMock.mockReset();
    store = {};
    runTransactionMock.mockImplementation(async (_db: unknown, fn: (tx: unknown) => unknown) =>
      fn(makeTx(store)),
    );
    TestBed.configureTestingModule({
      providers: [ProgressService, { provide: FIRESTORE, useValue: {} }],
    });
    service = TestBed.inject(ProgressService);
  });

  it('computes progressPct from completed / total lessons (rounded)', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1'], 3);
    expect(result.progressPct).toBe(33);
    expect(result.completed).toBe(false);
  });

  it('de-duplicates completed lesson ids before computing progress', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1', 'l1'], 2);
    expect(result.progressPct).toBe(50);
  });

  it('reaches 100% but never auto-completes the course (reserved for completeCourse)', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1', 'l2'], 2);
    expect(result.progressPct).toBe(100);
    expect(result.completed).toBe(false);
  });

  it('guards against a zero-lesson course (no divide-by-zero)', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', [], 0);
    expect(result.progressPct).toBe(0);
  });

  it('completeCourse forces pct=100, completed=true and persists the score', async () => {
    const result = await service.completeCourse('atl-airport', 'c1', 'u1', 88);
    expect(result.progressPct).toBe(100);
    expect(result.completed).toBe(true);
    expect(result.score).toBe(88);
  });

  it('writes the event idempotently before applying the enrollment', async () => {
    await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1'], 3, {
      idempotencyKey: 'evt-aaaaaaaa',
      deviceId: 'device-a',
      clientSeq: 1,
    });
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, event] = setDocMock.mock.calls[0];
    expect(event.idempotencyKey).toBe('evt-aaaaaaaa');
    expect(event.kind).toBe('lesson_completed');
    expect(event.clientSeq).toBe(1);
    expect(runTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing enrollment score on completeCourse when none is supplied', async () => {
    store.enrollment = {
      uid: 'u1',
      courseId: 'c1',
      tenantId: 'atl-airport',
      progressPct: 40,
      completed: false,
      score: 70,
      progressVersion: 1,
      completedLessonIds: ['l1'],
      attemptCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const result = await service.completeCourse('atl-airport', 'c1', 'u1', undefined, {
      idempotencyKey: 'evt-complete1',
      clientSeq: 2,
    });
    expect(result.score).toBe(70);
    expect(result.completed).toBe(true);
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('replay (same idempotency key, same clientSeq) is a no-op: never double-counts', async () => {
    const opts = { idempotencyKey: 'evt-replay01', deviceId: 'device-a', clientSeq: 1 };
    const first = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1'], 4, opts);
    expect(first.completedLessonIds).toEqual(['l1']);
    expect(first.progressVersion).toBe(1);

    // Replaying the same event must not advance the projection.
    const replay = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1'], 4, opts);
    expect(replay.completedLessonIds).toEqual(['l1']);
    expect(replay.progressPct).toBe(25);
    expect(replay.progressVersion).toBe(1);
  });

  it('an out-of-order (lower clientSeq) event does not regress applied progress', async () => {
    await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1', 'l2'], 4, {
      idempotencyKey: 'evt-seq00005',
      clientSeq: 5,
    });
    expect(store.enrollment?.progressVersion).toBe(5);
    expect(store.enrollment?.completedLessonIds).toEqual(['l1', 'l2']);

    // A late, lower-seq event arrives — it must be ignored, not regress state.
    const stale = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1'], 4, {
      idempotencyKey: 'evt-seq00002',
      clientSeq: 2,
    });
    expect(stale.progressVersion).toBe(5);
    expect(stale.completedLessonIds).toEqual(['l1', 'l2']);
    expect(stale.progressPct).toBe(50);
  });

  it('two sequential writers (rising clientSeq) do not lose each other\'s lessons', async () => {
    await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1'], 4, {
      idempotencyKey: 'evt-writer0a',
      deviceId: 'device-a',
      clientSeq: 1,
    });
    // Second writer only knows about l2, but the projection unions with l1.
    const merged = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l2'], 4, {
      idempotencyKey: 'evt-writer0b',
      deviceId: 'device-b',
      clientSeq: 2,
    });
    expect(new Set(merged.completedLessonIds)).toEqual(new Set(['l1', 'l2']));
    expect(merged.progressPct).toBe(50);
    expect(merged.progressVersion).toBe(2);
  });

  it('completeCourse still flips completed=true after lesson progress', async () => {
    await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1', 'l2'], 2, {
      idempotencyKey: 'evt-lesson001',
      clientSeq: 1,
    });
    expect(store.enrollment?.completed).toBe(false);
    const done = await service.completeCourse('atl-airport', 'c1', 'u1', 95, {
      idempotencyKey: 'evt-done00001',
      clientSeq: 2,
    });
    expect(done.completed).toBe(true);
    expect(done.progressPct).toBe(100);
    expect(done.score).toBe(95);
    expect(done.attemptCount).toBe(1);
  });
});
