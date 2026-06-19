import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import {
  type OfflineVideoPort,
  type ResolvedVideoSource,
  type UploadedVideoRef,
  VideoAssetService,
} from '@forge/lms-core';

/** Persisted index entry: where a downloaded video lives on the device + its size. */
interface DownloadRecord {
  localUri: string;
  sizeBytes: number;
}

/** Internal shape of the Preferences index keyed by `storagePath`. */
type DownloadIndex = Record<string, DownloadRecord>;

/** A downloaded entry surfaced by {@link OfflineVideoPort.listDownloads}. */
export interface OfflineDownload extends DownloadRecord {
  storagePath: string;
}

/** Preferences key holding the JSON `storagePath → DownloadRecord` index. */
const INDEX_KEY = 'forge.offline-video.index';

/** On-device directory (under `Directory.Data`) holding downloaded videos. */
const VIDEO_DIR = 'offline-videos';

/** Friendly message shown when a web user tries to download for offline. */
const WEB_DOWNLOAD_MESSAGE =
  'Offline downloads are available in the installed Soteria FORGE app. ' +
  'This video keeps streaming online here.';

/**
 * Capacitor-backed {@link OfflineVideoPort}: downloads uploaded course videos to
 * device storage and plays them back from disk, falling back to streaming.
 *
 * Native (iOS/Android): durable offline. Downloads write to `Directory.Data`
 * under `offline-videos/`, the `storagePath → { localUri, sizeBytes }` index is
 * kept in `@capacitor/preferences`, and playback uses `convertFileSrc`.
 *
 * Web: tree-safe, no durable offline. `supported()` is `false`, `download()`
 * rejects with a friendly message, and `resolve()` returns the remote URL
 * (refreshed via {@link VideoAssetService.getDownloadUrl} when online). This is
 * what keeps the learner app building and running as a normal web app.
 */
@Injectable({ providedIn: 'root' })
export class CapacitorOfflineVideoAdapter implements OfflineVideoPort {
  private readonly videoAssets = inject(VideoAssetService);

  /** Durable offline is only available inside the native Capacitor shell. */
  supported(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Resolve a playable source for a video block. A downloaded asset plays from
   * the on-device file; otherwise we stream the remote URL (refreshing it from
   * Storage when online so expiring download URLs stay valid).
   */
  async resolve(ref: UploadedVideoRef): Promise<ResolvedVideoSource> {
    if (ref.storagePath && this.supported()) {
      const record = await this.lookup(ref.storagePath);
      if (record) {
        return { src: Capacitor.convertFileSrc(record.localUri), offline: true };
      }
    }
    const remote = await this.resolveRemoteUrl(ref);
    return { src: remote, offline: false };
  }

  /** True when the asset has a recorded on-device download. */
  async isDownloaded(storagePath: string): Promise<boolean> {
    return (await this.lookup(storagePath)) !== undefined;
  }

  /**
   * Download an uploaded video to device storage and index it for offline
   * playback, reporting 0..1 progress. Rejects on web with a friendly message.
   */
  async download(ref: UploadedVideoRef, onProgress?: (pct: number) => void): Promise<void> {
    if (!this.supported()) {
      return Promise.reject(new Error(WEB_DOWNLOAD_MESSAGE));
    }
    if (!ref.storagePath) {
      return Promise.reject(new Error('This video cannot be downloaded for offline use.'));
    }
    const storagePath = ref.storagePath;

    onProgress?.(0);
    const url = await this.resolveRemoteUrl(ref);
    const blob = await this.fetchWithProgress(url, onProgress);
    const base64 = await blobToBase64(blob);

    const fileName = `${VIDEO_DIR}/${hashPath(storagePath)}.mp4`;
    await Filesystem.mkdir({
      path: VIDEO_DIR,
      directory: Directory.Data,
      recursive: true,
    }).catch(() => {
      // Directory already exists — Capacitor rejects mkdir on an existing path.
    });

    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Data,
      recursive: true,
      // No `encoding` ⇒ data is written as base64 (binary).
    });

    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Data });
    await this.indexUpdate((index) => {
      index[storagePath] = { localUri: uri, sizeBytes: ref.sizeBytes ?? blob.size };
    });
    onProgress?.(1);
  }

  /** Remove a downloaded video from device storage and the index. */
  async remove(storagePath: string): Promise<void> {
    const record = await this.lookup(storagePath);
    if (record && this.supported()) {
      const path = `${VIDEO_DIR}/${hashPath(storagePath)}.mp4`;
      await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {
        // File already gone — keep removal idempotent.
      });
    }
    await this.indexUpdate((index) => {
      delete index[storagePath];
    });
  }

  /** All recorded downloads (storagePath + size), for the Downloads page. */
  async listDownloads(): Promise<OfflineDownload[]> {
    const index = await this.readIndex();
    return Object.entries(index).map(([storagePath, record]) => ({ storagePath, ...record }));
  }

  /** Current online/offline signal via `@capacitor/network`. */
  async isOnline(): Promise<boolean> {
    try {
      const status = await Network.getStatus();
      return status.connected;
    } catch {
      // If the plugin is unavailable, assume online so playback still attempts.
      return true;
    }
  }

  // ---- internals -----------------------------------------------------------

  /**
   * Resolve the URL to stream/download from: prefer a fresh Storage download URL
   * (when we have a `storagePath` and we're online), else the ref's stored URL.
   */
  private async resolveRemoteUrl(ref: UploadedVideoRef): Promise<string> {
    if (ref.storagePath && (await this.isOnline())) {
      try {
        return await this.videoAssets.getDownloadUrl(ref.storagePath);
      } catch {
        // Fall back to the embedded URL if Storage can't be reached.
      }
    }
    return ref.url;
  }

  /** Fetch bytes, reporting 0..1 download progress when the length is known. */
  private async fetchWithProgress(url: string, onProgress?: (pct: number) => void): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}). Check your connection and try again.`);
    }

    const total = Number(response.headers.get('content-length') ?? 0);
    if (!onProgress || !response.body || !total) {
      // No streaming progress available — fall back to a single resolved Blob.
      return response.blob();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        onProgress(Math.min(0.99, received / total));
      }
    }
    return new Blob(chunks as BlobPart[], {
      type: response.headers.get('content-type') ?? 'video/mp4',
    });
  }

  private async lookup(storagePath: string): Promise<DownloadRecord | undefined> {
    const index = await this.readIndex();
    return index[storagePath];
  }

  private async readIndex(): Promise<DownloadIndex> {
    const { value } = await Preferences.get({ key: INDEX_KEY });
    if (!value) return {};
    try {
      return JSON.parse(value) as DownloadIndex;
    } catch {
      return {};
    }
  }

  private async indexUpdate(mutate: (index: DownloadIndex) => void): Promise<void> {
    const index = await this.readIndex();
    mutate(index);
    await Preferences.set({ key: INDEX_KEY, value: JSON.stringify(index) });
  }
}

/**
 * Stable, filesystem-safe id for a Storage path (FNV-1a → base36). Avoids any
 * runtime crypto dependency and keeps the on-disk file name short.
 */
function hashPath(storagePath: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < storagePath.length; i++) {
    hash ^= storagePath.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Convert a fetched Blob to a base64 payload (no `data:` prefix) for Filesystem. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read downloaded video.'));
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
