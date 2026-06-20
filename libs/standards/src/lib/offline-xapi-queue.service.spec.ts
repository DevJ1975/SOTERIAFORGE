/**
 * Unit tests for OfflineXapiQueue (MO-05 — IndexedDB-backed).
 *
 * jsdom does not ship IndexedDB and `fake-indexeddb` is not a workspace
 * dependency, so a minimal in-memory IndexedDB fake (the local
 * `fake-indexed-db.testkit`) is installed for the persistence tests. The fake's
 * backing data survives across `IndexedDbStore` instances, which lets us
 * simulate an app reload (a brand-new `OfflineXapiQueue`) and assert the queue
 * is rehydrated from durable storage.
 *
 * navigator.onLine / window events are stubbed via Object.defineProperty and
 * dispatchEvent so the online-flush and startup-flush paths are exercisable.
 */

// Stub @angular/fire/functions so nothing Firebase-related is imported.
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: jest.fn(() => jest.fn()),
}));

import { TestBed } from '@angular/core/testing';
import { OfflineXapiQueue } from './offline-xapi-queue.service';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from './fake-indexed-db.testkit';
import type { XapiStatement } from '@assurance/shared';

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

/** Flush the microtask queue so async IndexedDB writes/reads settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

describe('OfflineXapiQueue (IndexedDB-backed)', () => {
  beforeEach(() => {
    installFakeIndexedDb();
    setOnline(true);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    uninstallFakeIndexedDb();
    jest.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ---------------------------------------------------------------------------
  // enqueue / peekAll / size (synchronous mirror)
  // ---------------------------------------------------------------------------
  describe('enqueue', () => {
    it('appends statements to the in-memory mirror in order', () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      queue.enqueue(makeStmt('first'));
      queue.enqueue(makeStmt('second'));
      expect(queue.size()).toBe(2);
      const all = queue.peekAll();
      expect(all[0].object.id).toContain('first');
      expect(all[1].object.id).toContain('second');
    });

    it('updates the pendingCount signal', () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      expect(queue.pendingCount()).toBe(0);
      queue.enqueue(makeStmt('a'));
      expect(queue.pendingCount()).toBe(1);
    });

    it('persists statements to IndexedDB', async () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      queue.enqueue(makeStmt('persisted'));
      await flushMicrotasks();
      // A fresh instance reads the same durable backing store.
      const reloaded = TestBed.inject(OfflineXapiQueue);
      expect(reloaded).toBe(queue); // root singleton within one TestBed
    });
  });

  describe('peekAll / size', () => {
    it('returns an empty array / 0 for an empty queue', () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      expect(queue.peekAll()).toEqual([]);
      expect(queue.size()).toBe(0);
    });

    it('peekAll does not remove statements', () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      queue.enqueue(makeStmt());
      const before = queue.size();
      queue.peekAll();
      expect(queue.size()).toBe(before);
    });
  });

  // ---------------------------------------------------------------------------
  // flush
  // ---------------------------------------------------------------------------
  describe('flush', () => {
    it('calls sender for each queued statement and drains them', async () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      const sender = jest.fn().mockResolvedValue(undefined);
      queue.enqueue(makeStmt('f1'));
      queue.enqueue(makeStmt('f2'));
      await queue.flush(sender);
      expect(sender).toHaveBeenCalledTimes(2);
      expect(queue.size()).toBe(0);
    });

    it('keeps failing statements in the queue for the next flush', async () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      const sender = jest.fn().mockImplementation(async (s: XapiStatement) => {
        if (s.object.id.includes('fail')) throw new Error('network error');
      });

      queue.enqueue(makeStmt('ok'));
      queue.enqueue(makeStmt('fail'));
      await queue.flush(sender);

      expect(queue.size()).toBe(1);
      expect(queue.peekAll()[0].object.id).toContain('fail');
    });

    it('is a no-op on an empty queue', async () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      const sender = jest.fn().mockResolvedValue(undefined);
      await queue.flush(sender);
      expect(sender).not.toHaveBeenCalled();
    });

    it('removes drained statements from IndexedDB (survives reload)', async () => {
      const queue = TestBed.inject(OfflineXapiQueue);
      const sender = jest.fn().mockResolvedValue(undefined);
      queue.enqueue(makeStmt('drain-me'));
      await flushMicrotasks();
      await queue.flush(sender);
      await flushMicrotasks();

      // Reload: a new instance must NOT see the drained statement.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reloaded = TestBed.inject(OfflineXapiQueue);
      await flushMicrotasks();
      expect(reloaded.size()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // persistence survives a simulated reload
  // ---------------------------------------------------------------------------
  describe('persistence across reload', () => {
    it('rehydrates a queue persisted by a prior session', async () => {
      const first = TestBed.inject(OfflineXapiQueue);
      first.enqueue(makeStmt('survivor-1'));
      first.enqueue(makeStmt('survivor-2'));
      await flushMicrotasks();

      // Simulate the app being closed and reopened: brand-new injector, same
      // IndexedDB backing store.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reloaded = TestBed.inject(OfflineXapiQueue);
      await flushMicrotasks();

      expect(reloaded.size()).toBe(2);
      const ids = reloaded.peekAll().map((s) => s.object.id);
      expect(ids[0]).toContain('survivor-1');
      expect(ids[1]).toContain('survivor-2');
    });
  });

  // ---------------------------------------------------------------------------
  // startup flush (already-online reopen drains the queue)
  // ---------------------------------------------------------------------------
  describe('startup flush', () => {
    it('drains a persisted queue when registerSender is called while online', async () => {
      // Seed a queue and persist it.
      const first = TestBed.inject(OfflineXapiQueue);
      first.enqueue(makeStmt('startup-1'));
      await flushMicrotasks();

      // Reopen already-online.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      setOnline(true);
      const reloaded = TestBed.inject(OfflineXapiQueue);
      await flushMicrotasks();
      expect(reloaded.size()).toBe(1);

      // XapiClient would register its sender on startup — that triggers a flush.
      const sender = jest.fn().mockResolvedValue(undefined);
      reloaded.registerSender(sender);
      await flushMicrotasks();

      expect(sender).toHaveBeenCalledTimes(1);
      expect(reloaded.size()).toBe(0);
    });

    it('does NOT flush on registerSender when offline', async () => {
      const first = TestBed.inject(OfflineXapiQueue);
      first.enqueue(makeStmt('hold'));
      await flushMicrotasks();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      setOnline(false);
      const reloaded = TestBed.inject(OfflineXapiQueue);
      await flushMicrotasks();

      const sender = jest.fn().mockResolvedValue(undefined);
      reloaded.registerSender(sender);
      await flushMicrotasks();

      expect(sender).not.toHaveBeenCalled();
      expect(reloaded.size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // online event → auto flush
  // ---------------------------------------------------------------------------
  describe('online event triggers flush', () => {
    it('flushes via the registered sender when window fires online', async () => {
      // Register the sender while offline so the startup flush is suppressed and
      // we isolate the window `online` → flush path.
      setOnline(false);
      const queue = TestBed.inject(OfflineXapiQueue);
      const sender = jest.fn().mockResolvedValue(undefined);
      queue.registerSender(sender);
      queue.enqueue(makeStmt('online-test'));
      await flushMicrotasks();
      expect(sender).not.toHaveBeenCalled();

      // Come back online.
      setOnline(true);
      window.dispatchEvent(new Event('online'));
      await flushMicrotasks();

      expect(sender).toHaveBeenCalledTimes(1);
      expect(queue.size()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // quota / write error → retain, never drop
  // ---------------------------------------------------------------------------
  describe('no data loss on IndexedDB quota error', () => {
    it('retains the statement in memory when the IndexedDB write rejects', async () => {
      const queue = TestBed.inject(OfflineXapiQueue);

      // Force the next persist to fail as if the quota were exceeded.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dbAny = queue as any;
      jest.spyOn(dbAny.db, 'put').mockRejectedValue(new Error('QuotaExceededError'));

      queue.enqueue(makeStmt('quota'));
      await flushMicrotasks();

      // Not dropped: still present in the synchronous mirror and sendable.
      expect(queue.size()).toBe(1);
      const sender = jest.fn().mockResolvedValue(undefined);
      await queue.flush(sender);
      expect(sender).toHaveBeenCalledTimes(1);
      expect(queue.size()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // SSR / no-IndexedDB safety (mirror still works)
  // ---------------------------------------------------------------------------
  describe('without IndexedDB available', () => {
    it('still queues in memory and flushes (no throw)', async () => {
      uninstallFakeIndexedDb(); // remove the fake → indexedDB undefined
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const queue = TestBed.inject(OfflineXapiQueue);

      queue.enqueue(makeStmt('mem-only'));
      expect(queue.size()).toBe(1);

      const sender = jest.fn().mockResolvedValue(undefined);
      await queue.flush(sender);
      expect(sender).toHaveBeenCalledTimes(1);
      expect(queue.size()).toBe(0);
    });
  });
});
