import { Injectable, inject } from '@angular/core';
import { AuthoringApi, type UploadedAsset } from '@assurance/lms-core';

/** Upper bound the agent tools accept; matches the server upload limit (apps/assets). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export type { UploadedAsset };

/**
 * Uploads course media through the Forge API (`POST /api/assets`). The server
 * checks the caller is tenant staff and stores the file under the tenant; the
 * returned `assetRef` (`asset:<id>`) is what a lesson keeps in `assetRef`.
 */
@Injectable({ providedIn: 'root' })
export class CourseAssetUploader {
  private readonly api = inject(AuthoringApi);

  upload(file: Blob, fileName: string): Promise<UploadedAsset> {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File is ${file.size} bytes; the limit is ${MAX_UPLOAD_BYTES}.`);
    }
    return this.api.uploadAsset(file, safeFileName(fileName));
  }
}

/** Keeps a readable, path-safe file name (no separators or traversal). */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 100);
  return cleaned || 'asset';
}
