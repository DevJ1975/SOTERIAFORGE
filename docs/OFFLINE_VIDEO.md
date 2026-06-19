# Offline video (learner)

The Soteria FORGE learner app can host course videos in the platform (Firebase
Storage) and play them **offline on-device** through a [Capacitor](https://capacitorjs.com)
native wrapper. This document covers the learner / Capacitor layer (lane V2).
The end-to-end contract lives in [`OFFLINE_VIDEO_CONTRACTS.md`](./OFFLINE_VIDEO_CONTRACTS.md).

## How it works

A video block is **uploaded / offline-capable** iff it has a `storagePath`
(otherwise it's a legacy external YouTube/Vimeo embed, rendered as before).

For uploaded videos the shared lesson renderer (`@forge/lms-core`) injects an
`OfflineVideoPort`. The learner app provides that port via
`CapacitorOfflineVideoAdapter` (`OFFLINE_VIDEO_PORT` in `app.config.ts`):

| Capability        | Native (iOS / Android)                                                          | Web (browser)                                            |
| ----------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `supported()`     | `true` (`Capacitor.isNativePlatform()`)                                         | `false`                                                  |
| `download()`      | Fetches bytes → `Filesystem` `Directory.Data` under `offline-videos/{hash}.mp4` | Rejects with a friendly "available in the installed app" |
| `resolve()`       | Downloaded → `convertFileSrc(localUri)` (`offline: true`); else remote stream   | Remote stream (`offline: false`)                         |
| `isDownloaded()`  | Reads the `@capacitor/preferences` index                                        | `false`                                                  |
| `remove()`        | Deletes the file + index entry                                                  | Clears the (empty) index                                 |
| `listDownloads()` | `{ storagePath, sizeBytes }[]` from the index                                   | `[]`                                                     |

Implementation details:

- **Index:** `@capacitor/preferences` stores `storagePath → { localUri, sizeBytes }`
  under the key `forge.offline-video.index`.
- **Download URL:** when online we refresh a fresh Storage download URL via
  `VideoAssetService.getDownloadUrl(storagePath)`; offline we fall back to the
  block's stored `url`. Online/offline is read from `@capacitor/network`.
- **Files** are written to `Directory.Data/offline-videos/` (removed when the app
  is uninstalled). Fetched bytes are base64-encoded before the Filesystem write
  (Capacitor doesn't support `Blob` writes on native).
- **Progress:** `download()` streams the response and reports `0..1` progress.

### Learner UI

- A **Downloads** page (`/downloads`, lazy + `authGuard`, in the primary nav)
  lists saved videos with size, total on-device usage, a per-item Remove action,
  and a live network-status indicator. On web it explains that durable downloads
  require the installed app.
- The **player** header shows an "Available offline" affordance for courses with
  uploaded videos (ready / partial / prompt to download), plus a "Manage
  downloads" link. The per-video **Download for offline / Downloaded ✓ / Remove**
  control is rendered by the shared lesson renderer in `@forge/lms-core`.
- A `NetworkStatusService` exposes a `online` signal (backed by
  `@capacitor/network`) used by the indicators.

## Honest constraint

**Durable offline playback only works in the installed native app.** The native
iOS/Android build can't run in CI / this environment (no Android SDK / Xcode), so
the web build is verified here and the native steps are documented below. As a
**web app the learner plays uploaded videos online only** — `download()` is a
friendly no-op and `resolve()` returns the remote stream. Everything is
tree-safe: the Capacitor APIs degrade gracefully on web and the learner app
builds and runs as a normal SPA.

## Building the native app

Capacitor 7 (core, cli, android, ios, filesystem, network, preferences) and the
`cap:*` npm scripts are already installed. Root `capacitor.config.ts` points
`webDir` at `dist/apps/learner/browser`.

```bash
# 1. Build the learner web app (produces dist/apps/learner/browser)
npx nx build learner

# 2. Add the native platforms (generated android/ and ios/ are git-ignored)
npx cap add android
npx cap add ios

# 3. Copy the web assets + native plugins into the platforms
npm run cap:sync

# 4. Run on a device / simulator (requires the platform SDKs: Android Studio / Xcode)
npm run cap:android   # cap run android
npm run cap:ios       # cap run ios
```

Re-run `npm run cap:sync` after every web rebuild. The generated `android/` and
`ios/` directories are intentionally **not** committed (see `.gitignore`);
regenerate them with `npx cap add …` on a machine with the native SDKs.
