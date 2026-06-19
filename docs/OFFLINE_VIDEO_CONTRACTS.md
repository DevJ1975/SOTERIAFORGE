# Offline Video — Build Contracts (authoritative)

Goal: host course videos **in the platform** (Firebase Storage, replacing external YouTube/Vimeo
embeds) and let the learner **play them offline on-device** via a **Capacitor** native wrapper.
Full vertical: admin upload → Storage (tenant-scoped, gated) → learner plays from Storage → download
for offline → re-point the ATL seed.

Capacitor 7 is already installed (core, cli, android, ios, filesystem, network, preferences). Root
`package.json` already has `cap:*` scripts and `test:rules` now runs `--only firestore,storage`.

## Honest constraint (state it in any docs/UI)

The iOS/Android **native build cannot run in CI/this environment** (no Android SDK / Xcode). Agents
implement and unit-test the **TypeScript/web layer + Capacitor config**, verify the **web build**,
and **document** the native steps. The offline adapter MUST degrade gracefully on the web (plays
online; "download for offline" is only durable in the native app).

## Ownership lanes (no cross-lane edits, no git)

- **V1 — Core/Storage:** `libs/shared` (videoBlock fields + spec), `storage.rules`,
  `libs/data-access/src/rules/**` (storage rules spec), `libs/auth` (Storage provider + emulator),
  `libs/lms-core` (`VideoAssetService`, the `OFFLINE_VIDEO_PORT` interface+token, the
  `ForgeLessonRenderer` video change, `index.ts`).
- **V2 — Capacitor / learner offline:** `apps/learner/**`, root `capacitor.config.ts`, `.gitignore`
  (ignore generated `android/`, `ios/`), a short root `README`/docs note. Do NOT edit `package.json`.
- **V3 — Admin upload + seed:** `apps/admin/**`, `tools/seed/**` (+ a small sample `.mp4` asset).

`package.json`, the lockfile, and `.github/` are already handled by the orchestrator — do not touch.

## 1. Schema (V1) — extend `videoBlock` in `libs/shared/src/lib/schemas/authoring.ts`

Backward-compatible OPTIONAL fields (existing `url`/`caption` stay):

```ts
export const videoBlock = z.object({
  ...blockBase,
  kind: z.literal('video'),
  url: z.string().default(''), // download URL (uploaded) OR external YouTube/Vimeo page URL
  caption: z.string().optional(),
  storagePath: z.string().optional(), // Storage object path; presence ⇒ "uploaded" (offline-capable)
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  durationSec: z.number().nonnegative().optional(),
});
```

**Rule of interpretation everywhere:** a video block is an **uploaded/offline-capable** asset iff
`storagePath` is set; otherwise it's an external embed (legacy YouTube/Vimeo) rendered as today.

## 2. Storage layout + rules (V1)

Path convention (single source of truth):

```
tenants/{tenantId}/courses/{courseId}/videos/{fileId}.{ext}
```

`storage.rules` — mirror the Firestore claim checks (define storage-side helpers
`signedIn()/role()/isSuperadmin()/inTenant()/isAuthoring()` reading `request.auth.token`):

```
match /b/{bucket}/o {
  match /tenants/{tenantId}/courses/{courseId}/videos/{fileName} {
    allow read: if isSuperadmin() || inTenant(tenantId);
    allow write: if (isSuperadmin() || (inTenant(tenantId) && isAuthoring()))
      && request.resource.size < 500 * 1024 * 1024
      && request.resource.contentType.matches('video/.*');
  }
  match /{allPaths=**} { allow read, write: if false; } // keep deny-by-default
}
```

Add `libs/data-access/src/rules/storage.rules.spec.ts` (use `@firebase/rules-unit-testing`
`initializeTestEnvironment({ storage: { rules } })`): member can read, cross-tenant denied, authoring
can write a valid `video/*` under-limit object, learner/anon write denied, oversize/non-video denied.
Verify locally with `npm run test:rules` (now includes the storage emulator).

## 3. AngularFire Storage wiring (V1, `libs/auth`)

Add `provideStorage(() => getStorage())` to `provideForgeFirebase`, and connect the **Storage
emulator** in dev exactly like Auth/Firestore (`connectStorageEmulator(storage, host, 9199)` under
the same localhost guard). Export anything new from `libs/auth`.

## 4. lms-core surface (V1) — consumed by V2 (learner) and V3 (admin)

```ts
// VideoAssetService — uploads + URL resolution (uses @angular/fire/storage)
@Injectable({ providedIn: 'root' })
class VideoAssetService {
  uploadVideo(
    tenantId: string,
    courseId: string,
    file: File,
    onProgress?: (pct: number) => void, // 0..1
  ): Promise<{ storagePath: string; url: string; sizeBytes: number; mimeType: string }>;
  getDownloadUrl(storagePath: string): Promise<string>;
  buildVideoPath(tenantId: string, courseId: string, fileName: string): string;
}

// Platform-agnostic offline port (NO Capacitor import in lms-core)
interface UploadedVideoRef {
  storagePath?: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
}
interface ResolvedVideoSource {
  src: string;
  offline: boolean;
}
interface OfflineVideoPort {
  supported(): boolean; // durable offline available (native)
  resolve(ref: UploadedVideoRef): Promise<ResolvedVideoSource>; // local file if downloaded, else remote
  isDownloaded(storagePath: string): Promise<boolean>;
  download(ref: UploadedVideoRef, onProgress?: (pct: number) => void): Promise<void>;
  remove(storagePath: string): Promise<void>;
  listDownloads(): Promise<{ storagePath: string; sizeBytes: number }[]>;
}
const OFFLINE_VIDEO_PORT = new InjectionToken<OfflineVideoPort>('forge.offline-video-port');
```

`ForgeLessonRenderer` (lms-core): `inject(OFFLINE_VIDEO_PORT, { optional: true })`. For a video block
**with `storagePath`**: resolve the src via the port (fallback to `block.url` when no port — admin
preview), and when `port?.supported()` render a **"Download for offline" / "Downloaded ✓ / Remove"**
control with progress. For a block **without `storagePath`**: render the existing external embed
unchanged. Keep it accessible (labels, progress `aria-valuenow`).

## 5. Capacitor + learner offline (V2)

- Root `capacitor.config.ts`: `appId: 'com.soteriaforge.learner'`, `appName: 'Soteria FORGE'`,
  `webDir: 'dist/apps/learner/browser'`. Do NOT commit generated `android/`/`ios/` — add them to
  `.gitignore`; document `npx cap add android` / `npx cap add ios` + `npm run cap:sync`.
- `apps/learner`: a `CapacitorOfflineVideoAdapter implements OfflineVideoPort`:
  - `@capacitor/network` for online state; `@capacitor/preferences` for the `storagePath → { localUri,
sizeBytes }` index; `@capacitor/filesystem` to download (fetch the resolved download URL → write
    to `Directory.Data`) and `Capacitor.convertFileSrc(localUri)` for playback.
  - `supported()` = `Capacitor.isNativePlatform()`. On **web**: `supported()=false`, `download()`
    rejects with a friendly "offline available in the installed app" error, `resolve()` returns the
    remote URL (refresh via `VideoAssetService.getDownloadUrl(storagePath)` when online).
  - Provide it via `OFFLINE_VIDEO_PORT` in `apps/learner` `app.config.ts`.
- A learner **"Downloads"** route/page: list offline videos (course/title/size), remove, total usage,
  and a network-status indicator. Add nav + a small "Available offline" affordance in the player.
- The learner build must stay green as a **web** app (Capacitor APIs are tree-safe on web).

## 6. Admin upload (V3, `apps/admin` Forge Studio)

In the **video block inspector**, add a file picker + "Upload video" using `VideoAssetService.
uploadVideo(tenantId, courseId, file, onProgress)` (tenant/course from the builder context). Show
upload progress; on success set `block.storagePath`, `block.url`, `block.sizeBytes`, `block.mimeType`.
Keep the existing "paste a YouTube/Vimeo URL" path for external videos. Persist via the existing
builder store (no schema bypass).

## 7. Seed (V3, `tools/seed`)

- Connect firebase-admin to the **Storage emulator** (`STORAGE_EMULATOR_HOST=http://127.0.0.1:9199`
  or the admin SDK equivalent; bucket from `.firebaserc`/default). Update `tools/seed/README.md` to
  `firebase emulators:start --only auth,firestore,storage`.
- Add a SMALL sample `.mp4` under `tools/seed/assets/` (generate a tiny clip with `ffmpeg` if present,
  else commit a minimal valid mp4 — keep it tiny). Upload it to
  `tenants/atl-airport/courses/{courseId}/videos/{fileId}.mp4` for each ATL course that has a video
  block, and set that block's `storagePath` + `url` (emulator download URL) + `mimeType`/`sizeBytes`.
- Replace the external YouTube `video` blocks in `tools/seed/content/*` with these uploaded refs.
  Everything still validates against the (now-extended) `videoBlock` schema. Idempotent.

## Conventions (all)

Zod-validated shapes in `@forge/shared`; all Firestore I/O via data-access converters; Storage I/O via
`VideoAssetService`. Deny-by-default rules + tests ship with new paths. Design tokens only. Prettier
(single quotes / width 100 / trailing commas). Respect nx module boundaries. No agent runs git.
Self-check each owned project (`NX_DAEMON=false npx nx lint/test/build <proj>`); cross-lane imports
(OFFLINE_VIDEO_PORT, VideoAssetService, new videoBlock fields) resolve at integration.
