/**
 * Single source of truth for the seeded, platform-hosted course video.
 *
 * The ATL demo replaces the external YouTube/Vimeo `video` embeds with one
 * small sample clip uploaded to Firebase **Storage** (the emulator during a
 * local seed). A video block is "uploaded / offline-capable" iff it carries a
 * `storagePath` (see the extended `videoBlock` schema in @forge/shared and
 * docs/OFFLINE_VIDEO_CONTRACTS.md §1).
 *
 * Both the authored content blocks (so the files validate and stay self-
 * contained) and `seed-emulator.ts` (which actually uploads the bytes) derive
 * their paths/URLs from the helpers here, so the two never drift.
 */

/** Tenant that owns the seeded demo content. Mirrors seed-emulator.ts. */
export const SEED_TENANT_ID = 'atl-airport';

/** The sample asset on disk, relative to tools/seed/. */
export const SAMPLE_VIDEO_FILE = 'assets/sample-ramp-safety.mp4';

/** Byte size of the committed sample clip — fixed, so blocks validate offline. */
export const SAMPLE_VIDEO_SIZE_BYTES = 658;

export const SAMPLE_VIDEO_MIME = 'video/mp4';

/** Stable file id used for every course's uploaded video (idempotent re-seeds). */
export const SAMPLE_VIDEO_FILE_ID = 'intro-clip';

/**
 * Storage object path for a course's uploaded video. Mirrors the convention in
 * docs/OFFLINE_VIDEO_CONTRACTS.md §2 and `VideoAssetService.buildVideoPath`:
 *   tenants/{tenantId}/courses/{courseId}/videos/{fileId}.mp4
 */
export function videoStoragePath(courseId: string, tenantId: string = SEED_TENANT_ID): string {
  return `tenants/${tenantId}/courses/${courseId}/videos/${SAMPLE_VIDEO_FILE_ID}.mp4`;
}

/**
 * App-default Storage bucket for the dev project. With no explicit
 * `storageBucket` in the Firebase options (see libs/auth firebase.providers),
 * the JS and admin SDKs both default to `{projectId}.appspot.com`, so the seed
 * uploads to — and the blocks point at — the same bucket the apps resolve.
 */
export const SEED_STORAGE_BUCKET = 'soteria-forge-dev.appspot.com';

/**
 * Firebase Storage **emulator** download URL for an object. The emulator serves
 * objects at `/v0/b/{bucket}/o/{urlEncodedPath}?alt=media`. `bucket` defaults to
 * the app-default bucket for the dev project.
 */
export function emulatorDownloadUrl(
  storagePath: string,
  bucket = SEED_STORAGE_BUCKET,
  host = '127.0.0.1:9199',
): string {
  return `http://${host}/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

/** The fields a re-pointed `video` content block carries (minus id/kind). */
export interface UploadedVideoFields {
  url: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  caption?: string;
}

/**
 * Build the uploaded-video fields for a course's `video` block. Used by the
 * content authors below so the committed blocks already validate against the
 * extended `videoBlock` schema and point at the seeded Storage object.
 */
export function uploadedVideo(courseId: string, caption?: string): UploadedVideoFields {
  const storagePath = videoStoragePath(courseId);
  return {
    url: emulatorDownloadUrl(storagePath),
    storagePath,
    mimeType: SAMPLE_VIDEO_MIME,
    sizeBytes: SAMPLE_VIDEO_SIZE_BYTES,
    ...(caption ? { caption } : {}),
  };
}
