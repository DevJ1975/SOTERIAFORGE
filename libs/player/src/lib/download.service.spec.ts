import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import type { Module } from '@assurance/shared';
import { DownloadService, OFFLINE_CACHE_NAME } from './download.service';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from './fake-indexed-db.testkit';

/**
 * Test environment notes
 * ----------------------
 * jsdom provides neither the Cache Storage API (`caches`) nor
 * `navigator.storage.estimate`, so both are mocked here:
 *
 *  - `installFakeCaches()` installs a minimal in-memory `caches` global backed by
 *    a `Map<url, Response>`, supporting `open` → `{ put, delete, match }`. It
 *    records every `put`/`delete` so the tests can assert what landed in (and
 *    left) the offline cache.
 *  - `installFakeStorageEstimate({ quota, usage })` stubs `navigator.storage`
 *    with an `estimate()` resolving to the given numbers, driving the quota
 *    guard. Omit it to simulate the API being unavailable (download proceeds).
 *
 * IndexedDB is provided by the shared in-memory testkit
 * (`fake-indexed-db.testkit.ts`) used by the other offline specs in this lib.
 */

// ---- Cache Storage fake -----------------------------------------------------

interface FakeCache {
  store: Map<string, Response>;
  put: jest.Mock<Promise<void>, [string, Response]>;
  delete: jest.Mock<Promise<boolean>, [string]>;
  match: jest.Mock<Promise<Response | undefined>, [string]>;
}

let fakeCaches: Map<string, FakeCache>;

function installFakeCaches(): void {
  fakeCaches = new Map();
  const open = (name: string): Promise<FakeCache> => {
    let cache = fakeCaches.get(name);
    if (!cache) {
      const store = new Map<string, Response>();
      cache = {
        store,
        put: jest.fn((url: string, resp: Response) => {
          store.set(url, resp);
          return Promise.resolve();
        }),
        delete: jest.fn((url: string) => Promise.resolve(store.delete(url))),
        match: jest.fn((url: string) => Promise.resolve(store.get(url))),
      };
      fakeCaches.set(name, cache);
    }
    return Promise.resolve(cache);
  };
  (globalThis as { caches?: unknown }).caches = { open };
}

function uninstallFakeCaches(): void {
  delete (globalThis as { caches?: unknown }).caches;
}

// ---- navigator.storage.estimate fake ----------------------------------------

function installFakeStorageEstimate(estimate: { quota: number; usage: number }): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate: jest.fn(() => Promise.resolve(estimate)) },
  });
}

function uninstallFakeStorageEstimate(): void {
  if ('storage' in navigator) {
    // jsdom's navigator has no own `storage`; deleting our defined prop is safe.
    delete (navigator as unknown as Record<string, unknown>)['storage'];
  }
}

// ---- fetch fake -------------------------------------------------------------

function fakeResponse(body: string): Response {
  return {
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? null : null) },
    clone() {
      return fakeResponse(body);
    },
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer),
  } as unknown as Response;
}

function installFakeFetch(): void {
  (globalThis as { fetch?: unknown }).fetch = jest.fn((url: string) =>
    Promise.resolve(fakeResponse(`content-for:${url}`)),
  );
}

// ---- module fixtures --------------------------------------------------------

function makeModule(partial: Partial<Module> & Pick<Module, 'id'>): Module {
  return {
    courseId: 'course-1',
    tenantId: 'tenant-1',
    title: 'M',
    order: 0,
    contentType: 'video',
    xpReward: 0,
    badgeRefs: [],
    completion: {},
    createdAt: new Date().toISOString(),
    ...partial,
  } as Module;
}

const youtubeModule = makeModule({
  id: 'm-yt',
  contentType: 'video',
  externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
});
const vimeoModule = makeModule({
  id: 'm-vimeo',
  contentType: 'video',
  externalUrl: 'https://vimeo.com/123456789',
});
const storageModule = makeModule({
  id: 'm-storage',
  contentType: 'video',
  externalUrl:
    'https://firebasestorage.googleapis.com/v0/b/app.appspot.com/o/v.mp4?alt=media&token=abc',
});
const sameOriginModule = makeModule({
  id: 'm-local',
  contentType: 'video',
  externalUrl: 'http://localhost/assets/guide.mp4',
});

function newService(): DownloadService {
  TestBed.configureTestingModule({
    providers: [DownloadService, { provide: PLATFORM_ID, useValue: 'browser' }],
  });
  return TestBed.inject(DownloadService);
}

describe('DownloadService (MO-07)', () => {
  beforeEach(() => {
    installFakeIndexedDb();
    installFakeCaches();
    installFakeFetch();
  });

  afterEach(() => {
    uninstallFakeIndexedDb();
    uninstallFakeCaches();
    uninstallFakeStorageEstimate();
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
  });

  describe('cacheability detection', () => {
    it('flags YouTube and Vimeo modules as requiring a connection', () => {
      const svc = newService();
      const report = svc.analyzeCacheability([youtubeModule, vimeoModule]);
      expect(report.cacheable).toEqual([]);
      expect(report.requiresConnection.map((m) => m.id)).toEqual(['m-yt', 'm-vimeo']);
      expect(svc.cacheableUrl(youtubeModule)).toBeNull();
      expect(svc.cacheableUrl(vimeoModule)).toBeNull();
    });

    it('treats Firebase Storage and same-origin assets as cacheable', () => {
      const svc = newService();
      const report = svc.analyzeCacheability([storageModule, sameOriginModule, youtubeModule]);
      expect(report.cacheable.map((m) => m.id)).toEqual(['m-storage', 'm-local']);
      expect(report.requiresConnection.map((m) => m.id)).toEqual(['m-yt']);
      expect(svc.cacheableUrl(storageModule)).toBe(storageModule.externalUrl);
    });
  });

  describe('manifest round-trip (download → getManifest → remove)', () => {
    it('downloads cacheable assets, records a manifest, and removes them', async () => {
      installFakeStorageEstimate({ quota: 1_000_000_000, usage: 0 });
      const svc = newService();

      const result = await svc.download('tenant-1', 'course-1', [storageModule, youtubeModule]);
      expect(result.ok).toBe(true);
      expect(result.manifest?.items.map((i) => i.moduleId)).toEqual(['m-storage']);

      // Asset landed in the named offline cache.
      const cache = fakeCaches.get(OFFLINE_CACHE_NAME)!;
      expect(cache.put).toHaveBeenCalledTimes(1);
      expect(cache.store.has(storageModule.externalUrl!)).toBe(true);

      // Manifest persisted and queryable.
      const manifest = await svc.getManifest('tenant-1', 'course-1');
      expect(manifest?.courseId).toBe('course-1');
      expect(await svc.isDownloaded('tenant-1', 'course-1')).toBe(true);
      expect(svc.downloads()['course-1']?.downloaded).toBe(true);

      // Remove clears cache entry, manifest, and reactive state.
      await svc.remove('tenant-1', 'course-1');
      expect(cache.delete).toHaveBeenCalledWith(storageModule.externalUrl!);
      expect(await svc.getManifest('tenant-1', 'course-1')).toBeUndefined();
      expect(svc.downloads()['course-1']).toBeUndefined();
    });

    it('refuses when there is nothing cacheable', async () => {
      const svc = newService();
      const result = await svc.download('tenant-1', 'course-1', [youtubeModule, vimeoModule]);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/no downloadable content/i);
    });
  });

  describe('quota guard', () => {
    it('refuses the download when the estimate exceeds the remaining quota', async () => {
      // quota - usage = 5 bytes remaining; the asset body is far larger.
      installFakeStorageEstimate({ quota: 105, usage: 100 });
      const svc = newService();

      const result = await svc.download('tenant-1', 'course-1', [storageModule]);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/not enough storage/i);

      // Nothing was committed to the cache or the manifest store.
      expect(fakeCaches.get(OFFLINE_CACHE_NAME)).toBeUndefined();
      expect(await svc.getManifest('tenant-1', 'course-1')).toBeUndefined();
    });

    it('proceeds when storage.estimate is unavailable (cannot determine a limit)', async () => {
      // No installFakeStorageEstimate → navigator.storage absent.
      const svc = newService();
      const result = await svc.download('tenant-1', 'course-1', [storageModule]);
      expect(result.ok).toBe(true);
    });
  });
});
