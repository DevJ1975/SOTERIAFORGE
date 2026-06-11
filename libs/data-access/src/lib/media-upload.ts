import { Injectable, signal, type Signal } from '@angular/core';
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
  type UploadTask,
} from 'firebase/storage';

/** What is being uploaded; determines the media path segment + accepted types. */
export type MediaKind = 'image' | 'video' | 'cover';

export type MediaUploadState = 'running' | 'success' | 'error';

/**
 * Client-side mirror of the storage.rules guard
 * (`request.resource.size < 200 * 1024 * 1024`): files of exactly 200 MB or
 * more are rejected before any bytes leave the browser.
 */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export interface MediaUploadOptions {
  tenantId: string;
  file: File;
  kind: MediaKind;
}

/** Live view over one upload, signal-based so templates can bind directly. */
export interface MediaUploadHandle {
  /** 0–100, driven by uploadBytesResumable progress events. */
  progress: Signal<number>;
  state: Signal<MediaUploadState>;
  /** Set (via getDownloadURL) once the upload completes successfully. */
  downloadUrl: Signal<string | null>;
  /** Human-readable failure reason when state() === 'error'. */
  error: Signal<string | null>;
  /** Aborts an in-flight upload. No-op once settled. */
  cancel(): void;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without any Firebase instance)
// ---------------------------------------------------------------------------

/**
 * Normalizes a filename into a storage-safe slug, keeping the extension:
 * `Säfety Brief (v2).PNG` → `safety-brief-v2.png`.
 */
export function slugifyFilename(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : '';
  const slug = (value: string): string =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const safeBase = slug(base) || 'file';
  const safeExt = slug(ext);
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/**
 * Builds the tenant-scoped object path opened up in storage.rules:
 * `tenants/{tenantId}/media/{kind}/{timestamp}-{slugified filename}`.
 */
export function buildMediaPath(
  tenantId: string,
  kind: MediaKind,
  fileName: string,
  timestamp: number = Date.now(),
): string {
  return `tenants/${tenantId}/media/${kind}/${timestamp}-${slugifyFilename(fileName)}`;
}

/** `accept` attribute for a file input feeding {@link ForgeMediaUpload}. */
export function mediaAccept(kind: MediaKind): string {
  return kind === 'video' ? 'video/*' : 'image/*';
}

/**
 * Validates a candidate file against the storage.rules guards: contentType
 * must match the kind ('cover' is an image) and size must stay under
 * {@link MAX_MEDIA_BYTES}. Returns a user-facing error message, or null when
 * the file is acceptable.
 */
export function validateMediaFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
  kind: MediaKind,
): string | null {
  const expected = kind === 'video' ? 'video/' : 'image/';
  if (!file.type.startsWith(expected)) {
    return kind === 'video'
      ? 'That file is not a video — pick a video file (e.g. MP4).'
      : 'That file is not an image — pick an image file (e.g. PNG or JPEG).';
  }
  if (file.size >= MAX_MEDIA_BYTES) {
    return 'File is too large — uploads are limited to 200 MB.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Upload service
// ---------------------------------------------------------------------------

/**
 * Uploads Forge Studio media (course covers, image/video blocks) to
 * tenant-scoped Cloud Storage and exposes the upload as signals.
 *
 * The Firebase calls sit behind the protected {@link startUpload} /
 * {@link resolveDownloadUrl} seams so unit tests can stub them without ever
 * instantiating Firebase Storage.
 */
@Injectable({ providedIn: 'root' })
export class ForgeMediaUpload {
  upload(storage: FirebaseStorage, opts: MediaUploadOptions): MediaUploadHandle {
    const progress = signal(0);
    const state = signal<MediaUploadState>('running');
    const downloadUrl = signal<string | null>(null);
    const error = signal<string | null>(null);

    const settle = (failure: string | null): void => {
      if (failure !== null) error.set(failure);
      state.set(failure === null ? 'success' : 'error');
    };

    const invalid = validateMediaFile(opts.file, opts.kind);
    if (invalid) {
      settle(invalid);
      return { progress, state, downloadUrl, error, cancel: () => undefined };
    }

    const path = buildMediaPath(opts.tenantId, opts.kind, opts.file.name);
    const task = this.startUpload(storage, path, opts.file);
    task.on(
      'state_changed',
      (snapshot) => {
        const { bytesTransferred, totalBytes } = snapshot;
        progress.set(totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 0);
      },
      (err) => settle(err.message || 'Upload failed.'),
      () => {
        this.resolveDownloadUrl(task).then(
          (url) => {
            downloadUrl.set(url);
            progress.set(100);
            settle(null);
          },
          (err: unknown) =>
            settle(err instanceof Error ? err.message : 'Could not resolve the download URL.'),
        );
      },
    );
    return { progress, state, downloadUrl, error, cancel: () => void task.cancel() };
  }

  /** Seam over ref() + uploadBytesResumable(); stubbed in unit tests. */
  protected startUpload(storage: FirebaseStorage, path: string, file: File): UploadTask {
    return uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
  }

  /** Seam over getDownloadURL(); stubbed in unit tests. */
  protected resolveDownloadUrl(task: UploadTask): Promise<string> {
    return getDownloadURL(task.snapshot.ref);
  }
}
