import { inject, Injectable } from '@angular/core';
import {
  getDownloadURL,
  ref,
  Storage,
  uploadBytesResumable,
} from '@angular/fire/storage';

/** The result of a successful upload, ready to stamp onto a `videoBlock`. */
export interface UploadedVideoResult {
  storagePath: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Uploads course videos to Cloud Storage and resolves their download URLs.
 *
 * Storage is the single source of truth for the object path
 * (`tenants/{tenantId}/courses/{courseId}/videos/{fileName}`); the security
 * rules gate writes to authoring roles inside the tenant (see storage.rules).
 */
@Injectable({ providedIn: 'root' })
export class VideoAssetService {
  private readonly storage = inject(Storage);

  /**
   * The canonical Storage object path for a course video. Mirrors the path used
   * by the security rules and the seed; the single source of truth for layout.
   */
  buildVideoPath(tenantId: string, courseId: string, fileName: string): string {
    return `tenants/${tenantId}/courses/${courseId}/videos/${fileName}`;
  }

  /**
   * Uploads a video file under the tenant/course path, reporting progress as a
   * 0..1 fraction. Resolves with the storage path, a fresh download URL, and the
   * recorded size/MIME so the caller can persist them on the block.
   */
  uploadVideo(
    tenantId: string,
    courseId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<UploadedVideoResult> {
    const storagePath = this.buildVideoPath(tenantId, courseId, file.name);
    const objectRef = ref(this.storage, storagePath);
    const mimeType = file.type || 'video/mp4';
    const task = uploadBytesResumable(objectRef, file, { contentType: mimeType });

    return new Promise<UploadedVideoResult>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes > 0) {
            onProgress(snapshot.bytesTransferred / snapshot.totalBytes);
          }
        },
        (error) => reject(error),
        async () => {
          try {
            const url = await getDownloadURL(objectRef);
            resolve({ storagePath, url, sizeBytes: file.size, mimeType });
          } catch (error) {
            reject(error);
          }
        },
      );
    });
  }

  /** A fresh, time-limited download URL for an existing Storage object path. */
  getDownloadUrl(storagePath: string): Promise<string> {
    return getDownloadURL(ref(this.storage, storagePath));
  }
}
