import { InjectionToken } from '@angular/core';

/**
 * Reference to an uploaded (offline-capable) video asset. Mirrors the relevant
 * fields of a `videoBlock` so callers can hand a block straight to the port.
 */
export interface UploadedVideoRef {
  /** Cloud Storage object path; presence marks the asset as offline-capable. */
  storagePath?: string;
  /** Remote download URL used when no local copy exists. */
  url: string;
  mimeType?: string;
  sizeBytes?: number;
}

/** A playable source resolved by the offline port. */
export interface ResolvedVideoSource {
  /** A URL or local file URI the `<video>` element can play. */
  src: string;
  /** True when `src` points at a durable on-device copy. */
  offline: boolean;
}

/**
 * Platform-agnostic offline-video adapter. The web layer (lms-core) depends only
 * on this interface; the durable native implementation lives in the learner app
 * (Capacitor). lms-core MUST NOT import Capacitor — this seam is why.
 */
export interface OfflineVideoPort {
  /** True when durable offline downloads are available (native app). */
  supported(): boolean;
  /** Local file if downloaded, otherwise the remote URL. */
  resolve(ref: UploadedVideoRef): Promise<ResolvedVideoSource>;
  isDownloaded(storagePath: string): Promise<boolean>;
  /** Download for offline; `onProgress` reports 0..1. */
  download(ref: UploadedVideoRef, onProgress?: (pct: number) => void): Promise<void>;
  remove(storagePath: string): Promise<void>;
  listDownloads(): Promise<{ storagePath: string; sizeBytes: number }[]>;
}

/**
 * DI token for the {@link OfflineVideoPort}. Optional everywhere: when no port is
 * provided (e.g. the admin preview), uploaded videos fall back to their remote
 * `url` and the offline controls are hidden.
 */
export const OFFLINE_VIDEO_PORT = new InjectionToken<OfflineVideoPort>('forge.offline-video-port');
