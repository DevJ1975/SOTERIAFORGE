import { Injectable, inject } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { ASSURANCE_ENV } from '@assurance/auth';

/** Matches the per-object cap on `tenants/{tenantId}/**` in storage.rules. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export interface UploadedAsset {
  /** Storage object path. */
  path: string;
  /** URL the learner player loads (module `assetRef`). */
  downloadUrl: string;
}

/**
 * Uploads course media to the tenant's asset folder. Storage rules allow writes
 * there only for tenant authors, so the signed-in user's role is enforced
 * server-side as well as by the callers.
 *
 * Interim: Phase 2 of docs/forge-platform-plan.md replaces Firebase Storage
 * with Django-issued signed upload URLs; only this class changes.
 */
@Injectable({ providedIn: 'root' })
export class CourseAssetUploader {
  private readonly env = inject(ASSURANCE_ENV);

  async upload(
    tenantId: string,
    courseId: string,
    file: Blob,
    fileName: string,
  ): Promise<UploadedAsset> {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File is ${file.size} bytes; the limit is ${MAX_UPLOAD_BYTES}.`);
    }
    const app = getApps()[0] ?? initializeApp(this.env.firebase);
    const path = `tenants/${tenantId}/courses/${courseId}/assets/${crypto.randomUUID()}-${safeFileName(fileName)}`;
    const objectRef = ref(getStorage(app), path);
    await uploadBytes(objectRef, file, { contentType: file.type || undefined });
    return { path, downloadUrl: await getDownloadURL(objectRef) };
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
