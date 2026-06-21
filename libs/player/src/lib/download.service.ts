import { Injectable, PLATFORM_ID, type Signal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IndexedDbStore, isIndexedDbAvailable } from '@assurance/shared';
import type { Module } from '@assurance/shared';

/**
 * "Download for offline" service (MO-07).
 *
 * Responsibilities (all SSR/Node-safe — every method guards the browser and the
 * relevant API, and no-ops/returns a safe value off-browser):
 *
 *  1. **Cacheability detection.** A module's content is cacheable when it is
 *     same-origin or a Firebase Storage download URL (served from `assetRef` /
 *     an `externalUrl` pointing at `firebasestorage.googleapis.com` /
 *     `*.firebasestorage.app`). It is NOT cacheable when it streams from a
 *     third-party embed host (YouTube/Vimeo/etc.) — those are iframes the Cache
 *     Storage API cannot capture, so the learner UI shows "requires connection".
 *  2. **Download.** Each cacheable module asset is fetched into a named Cache
 *     Storage cache ({@link OFFLINE_CACHE_NAME}) via
 *     `caches.open(...).then(c => c.put(url, response))`, and a per-course
 *     {@link DownloadManifest} is recorded in IndexedDB.
 *  3. **Quota guard.** Before downloading, `navigator.storage.estimate()` is
 *     consulted; the download is refused (with a clear message) if it would
 *     exceed the remaining quota.
 *  4. **Query/remove + reactive state.** {@link getManifest} / {@link isDownloaded}
 *     / {@link remove}, plus a {@link downloads} signal (courseId → state) and an
 *     {@link inProgress} flag the UI can read.
 *
 * ## IndexedDB placement / footgun-safety
 *
 * The manifest store uses its **own database** `assurance.downloads` (store
 * `manifests`), separate from the other per-feature databases (xAPI queue, quiz
 * outbox, quiz drafts, completion outbox). IndexedDB object stores can only be
 * created during `onupgradeneeded`; sharing a database across unrelated services
 * means every one of them must declare every sibling store and coordinate the
 * version number. Giving downloads its own database removes that cross-service
 * coupling entirely (the wrapper's `allStores` only needs this one store).
 */

/** Named Cache Storage cache holding downloaded module assets. */
export const OFFLINE_CACHE_NAME = 'assurance-offline-v1';

const DB_NAME = 'assurance.downloads';
const STORE_NAME = 'manifests';

/** A single downloaded asset within a course manifest. */
export interface DownloadManifestItem {
  moduleId: string;
  url: string;
  bytes: number;
}

/** Per-course record of what was downloaded for offline use. */
export interface DownloadManifest {
  tenantId: string;
  courseId: string;
  /** ISO timestamp of when the download completed. */
  downloadedAt: string;
  items: DownloadManifestItem[];
  totalBytes: number;
}

/** Cacheability split for a course's modules. */
export interface CacheabilityReport {
  /** Modules whose asset can be fetched into the offline cache. */
  cacheable: Module[];
  /** Modules that require a live connection (YouTube/Vimeo/iframe embeds). */
  requiresConnection: Module[];
}

/** Reactive per-course download state surfaced to the UI. */
export interface DownloadState {
  downloaded: boolean;
  totalBytes: number;
}

/** Result of a {@link DownloadService.download} attempt. */
export interface DownloadResult {
  ok: boolean;
  /** Present and human-readable when `ok` is false. */
  reason?: string;
  manifest?: DownloadManifest;
}

/** Hosts whose content is embedded via iframe and cannot be cached offline. */
const EMBED_HOSTS = [
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'vimeo.com',
  'player.vimeo.com',
  'dailymotion.com',
  'wistia.com',
  'loom.com',
];

function manifestKey(tenantId: string, courseId: string): string {
  return `${tenantId}:${courseId}`;
}

/** True when `host` is (or is a subdomain of) one of the embed hosts. */
function isEmbedHost(host: string): boolean {
  const h = host.toLowerCase();
  return EMBED_HOSTS.some((e) => h === e || h.endsWith(`.${e}`));
}

/** True when `host` is a Firebase Storage download host. */
function isFirebaseStorageHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'firebasestorage.googleapis.com' ||
    h === 'storage.googleapis.com' ||
    h.endsWith('.firebasestorage.app')
  );
}

@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly manifests = new IndexedDbStore<DownloadManifest>(DB_NAME, STORE_NAME);

  /** Map of courseId → download state, for the learner UI to read reactively. */
  private readonly _downloads = signal<Record<string, DownloadState>>({});
  readonly downloads: Signal<Record<string, DownloadState>> = this._downloads.asReadonly();

  /** True while a download is running (UI disables the control). */
  private readonly _inProgress = signal(false);
  readonly inProgress: Signal<boolean> = this._inProgress.asReadonly();

  constructor() {
    if (this.isBrowser) {
      void this.hydrate();
    }
  }

  /**
   * Resolve the cacheable asset URL for a module, or `null` if the module has no
   * cacheable content (no asset, or an embed-host external URL).
   *
   * - `externalUrl` on an embed host (YouTube/Vimeo/…) → not cacheable (`null`).
   * - `externalUrl` that is same-origin or a Firebase Storage URL → cacheable.
   * - `assetRef` (a Storage download URL or same-origin path) → cacheable.
   *
   * Malformed URLs are treated as not cacheable.
   */
  cacheableUrl(mod: Module): string | null {
    const candidate = mod.externalUrl ?? mod.assetRef;
    if (!candidate) return null;
    return this.isCacheableUrl(candidate) ? candidate : null;
  }

  /** Whether a single URL string is cacheable per the rules above. */
  isCacheableUrl(raw: string): boolean {
    const origin =
      this.isBrowser && typeof location !== 'undefined' ? location.origin : 'https://localhost';
    let parsed: URL;
    try {
      parsed = new URL(raw, origin);
    } catch {
      return false;
    }
    // Same-origin (covers relative asset paths resolved against the app origin).
    if (this.isBrowser && typeof location !== 'undefined' && parsed.origin === location.origin) {
      return true;
    }
    if (isEmbedHost(parsed.host)) return false;
    if (isFirebaseStorageHost(parsed.host)) return true;
    // Unknown cross-origin host: not safely cacheable (CORS/opaque), and not a
    // recognised self-hosted asset — treat as requiring a connection.
    return false;
  }

  /** Split a course's modules into cacheable vs. connection-required. */
  analyzeCacheability(modules: readonly Module[]): CacheabilityReport {
    const cacheable: Module[] = [];
    const requiresConnection: Module[] = [];
    for (const mod of modules) {
      if (this.cacheableUrl(mod)) cacheable.push(mod);
      else requiresConnection.push(mod);
    }
    return { cacheable, requiresConnection };
  }

  /** Read the persisted manifest for a course, or `undefined` if none. */
  async getManifest(tenantId: string, courseId: string): Promise<DownloadManifest | undefined> {
    if (!this.isBrowser || !isIndexedDbAvailable()) return undefined;
    return this.manifests.get(manifestKey(tenantId, courseId));
  }

  /** True when a course has a recorded download manifest. */
  async isDownloaded(tenantId: string, courseId: string): Promise<boolean> {
    return (await this.getManifest(tenantId, courseId)) !== undefined;
  }

  /**
   * Download every cacheable module asset for a course into the offline cache
   * and record a manifest. Refuses (with a reason) when off-browser, when Cache
   * Storage is unavailable, when there is nothing cacheable, or when the
   * estimated download would exceed the remaining storage quota.
   */
  async download(
    tenantId: string,
    courseId: string,
    modules: readonly Module[],
  ): Promise<DownloadResult> {
    if (!this.isBrowser || typeof caches === 'undefined') {
      return { ok: false, reason: 'Offline download is not available in this environment.' };
    }

    const { cacheable } = this.analyzeCacheability(modules);
    if (cacheable.length === 0) {
      return {
        ok: false,
        reason: 'This course has no downloadable content (all modules require a connection).',
      };
    }

    this._inProgress.set(true);
    try {
      // Fetch first so we know the real byte sizes, then run the quota guard
      // against the sum before committing anything to the cache.
      const fetched: Array<{ mod: Module; url: string; response: Response; bytes: number }> = [];
      for (const mod of cacheable) {
        const url = this.cacheableUrl(mod);
        if (!url) continue;
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const bytes = await this.responseBytes(response.clone());
          fetched.push({ mod, url, response, bytes });
        } catch {
          // Skip an asset that fails to fetch (network/CORS); others may succeed.
        }
      }

      if (fetched.length === 0) {
        return { ok: false, reason: 'Could not fetch any module content for offline use.' };
      }

      const totalBytes = fetched.reduce((sum, f) => sum + f.bytes, 0);

      const quota = await this.checkQuota(totalBytes);
      if (!quota.ok) {
        return { ok: false, reason: quota.reason };
      }

      const cache = await caches.open(OFFLINE_CACHE_NAME);
      const items: DownloadManifestItem[] = [];
      for (const f of fetched) {
        await cache.put(f.url, f.response);
        items.push({ moduleId: f.mod.id, url: f.url, bytes: f.bytes });
      }

      const manifest: DownloadManifest = {
        tenantId,
        courseId,
        downloadedAt: new Date().toISOString(),
        items,
        totalBytes,
      };
      await this.manifests.put(manifestKey(tenantId, courseId), manifest).catch(() => undefined);
      this.setState(courseId, { downloaded: true, totalBytes });
      return { ok: true, manifest };
    } finally {
      this._inProgress.set(false);
    }
  }

  /** Delete a course's cached assets and its manifest. No-op off-browser. */
  async remove(tenantId: string, courseId: string): Promise<void> {
    if (!this.isBrowser) return;
    const manifest = await this.getManifest(tenantId, courseId);
    if (manifest && typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        await Promise.all(manifest.items.map((i) => cache.delete(i.url).catch(() => undefined)));
      } catch {
        // Best-effort cache cleanup; the manifest removal below is what matters.
      }
    }
    if (isIndexedDbAvailable()) {
      await this.manifests.delete(manifestKey(tenantId, courseId)).catch(() => undefined);
    }
    this.clearState(courseId);
  }

  /**
   * Quota guard: refuse when the estimated download would not fit in the
   * remaining storage quota. When `navigator.storage.estimate()` is unavailable
   * we proceed (cannot determine a limit) rather than block the user.
   */
  private async checkQuota(neededBytes: number): Promise<{ ok: boolean; reason?: string }> {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      return { ok: true };
    }
    try {
      const { quota, usage } = await navigator.storage.estimate();
      if (typeof quota !== 'number') return { ok: true };
      const remaining = quota - (usage ?? 0);
      if (neededBytes > remaining) {
        return {
          ok: false,
          reason: `Not enough storage to download (${formatBytes(neededBytes)} needed, ${formatBytes(
            Math.max(remaining, 0),
          )} free). Free up space and try again.`,
        };
      }
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }

  /** Best-effort byte size of a response body (header first, then read). */
  private async responseBytes(response: Response): Promise<number> {
    const len = response.headers.get('content-length');
    if (len) {
      const n = Number(len);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    try {
      const buf = await response.arrayBuffer();
      return buf.byteLength;
    } catch {
      return 0;
    }
  }

  /** Load persisted manifests into the reactive map on startup. */
  private async hydrate(): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    try {
      const all = await this.manifests.getAll();
      const map: Record<string, DownloadState> = {};
      for (const m of all) {
        map[m.courseId] = { downloaded: true, totalBytes: m.totalBytes };
      }
      this._downloads.set(map);
    } catch {
      // Non-fatal: UI will fall back to per-course lookups.
    }
  }

  private setState(courseId: string, state: DownloadState): void {
    this._downloads.update((m) => ({ ...m, [courseId]: state }));
  }

  private clearState(courseId: string): void {
    this._downloads.update((m) => {
      const next = { ...m };
      delete next[courseId];
      return next;
    });
  }
}

/** Compact human-readable byte size (used in quota messages and the UI). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
