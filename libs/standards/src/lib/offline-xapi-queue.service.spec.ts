/**
 * Unit tests for OfflineXapiQueue.
 *
 * jsdom (used by Jest / jest-preset-angular) provides a working `localStorage`
 * implementation, so no manual mock is needed.  We do clear it between tests
 * to keep them isolated.
 *
 * navigator.onLine / window events are stubbed via Object.defineProperty and
 * dispatchEvent so that the online-flush path is exercisable.
 */

// Stub @angular/fire/functions so nothing Firebase-related is imported.
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(() => jest.fn()),
}));

import { TestBed } from '@angular/core/testing';
import { OfflineXapiQueue } from './offline-xapi-queue.service';
import type { XapiStatement } from '@forge/shared';

const QUEUE_KEY = 'forge.xapi.queue';

function makeStmt(id = 'stmt-1'): XapiStatement {
  return {
    actor: { objectType: 'Agent', account: { homePage: 'https://x.com', name: 'uid-1' } },
    verb: { id: 'https://adlnet.gov/expapi/verbs/launched', display: { 'en-US': 'launched' } },
    object: { objectType: 'Activity', id: `https://x.com/activities/${id}` },
    timestamp: new Date().toISOString(),
    tenantId: 'tenant-1',
    actorUid: 'uid-1',
  } as unknown as XapiStatement;
}

describe('OfflineXapiQueue', () => {
  let queue: OfflineXapiQueue;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    queue = TestBed.inject(OfflineXapiQueue);
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // enqueue
  // ---------------------------------------------------------------------------
  describe('enqueue', () => {
    it('persists a statement to localStorage', () => {
      const stmt = makeStmt('a');
      queue.enqueue(stmt);
      const raw = localStorage.getItem(QUEUE_KEY);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw ?? '[]') as XapiStatement[];
      expect(stored).toHaveLength(1);
      expect(stored[0].object.id).toBe('https://x.com/activities/a');
    });

    it('appends multiple statements in order', () => {
      queue.enqueue(makeStmt('first'));
      queue.enqueue(makeStmt('second'));
      expect(queue.size()).toBe(2);
      const all = queue.peekAll();
      expect(all[0].object.id).toContain('first');
      expect(all[1].object.id).toContain('second');
    });
  });

  // ---------------------------------------------------------------------------
  // peekAll
  // ---------------------------------------------------------------------------
  describe('peekAll', () => {
    it('returns an empty array when the queue is empty', () => {
      expect(queue.peekAll()).toEqual([]);
    });

    it('returns queued statements without removing them', () => {
      queue.enqueue(makeStmt());
      const before = queue.size();
      queue.peekAll();
      expect(queue.size()).toBe(before);
    });
  });

  // ---------------------------------------------------------------------------
  // size
  // ---------------------------------------------------------------------------
  describe('size', () => {
    it('returns 0 for an empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('increments with each enqueue', () => {
      queue.enqueue(makeStmt('x1'));
      expect(queue.size()).toBe(1);
      queue.enqueue(makeStmt('x2'));
      expect(queue.size()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // flush
  // ---------------------------------------------------------------------------
  describe('flush', () => {
    it('calls sender for each queued statement', async () => {
      const sender = jest.fn().mockResolvedValue(undefined);
      queue.enqueue(makeStmt('f1'));
      queue.enqueue(makeStmt('f2'));
      await queue.flush(sender);
      expect(sender).toHaveBeenCalledTimes(2);
    });

    it('removes successfully sent statements from the queue', async () => {
      const sender = jest.fn().mockResolvedValue(undefined);
      queue.enqueue(makeStmt('ok'));
      await queue.flush(sender);
      expect(queue.size()).toBe(0);
    });

    it('keeps failing statements in the queue for next flush', async () => {
      const okStmt = makeStmt('ok');
      const failStmt = makeStmt('fail');

      const sender = jest.fn().mockImplementation(async (s: XapiStatement) => {
        if (s.object.id.includes('fail')) throw new Error('network error');
      });

      queue.enqueue(okStmt);
      queue.enqueue(failStmt);
      await queue.flush(sender);

      expect(queue.size()).toBe(1);
      expect(queue.peekAll()[0].object.id).toContain('fail');
    });

    it('is a no-op on an empty queue', async () => {
      const sender = jest.fn().mockResolvedValue(undefined);
      await queue.flush(sender);
      expect(sender).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // online event → auto flush
  // ---------------------------------------------------------------------------
  describe('online event triggers flush', () => {
    it('flushes via registered sender when window fires online event', async () => {
      const sender = jest.fn().mockResolvedValue(undefined);
      queue.registerSender(sender);
      queue.enqueue(makeStmt('online-test'));

      // Simulate coming back online
      window.dispatchEvent(new Event('online'));

      // Let microtasks (the async flush) settle
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sender).toHaveBeenCalledTimes(1);
      expect(queue.size()).toBe(0);
    });
  });
});
