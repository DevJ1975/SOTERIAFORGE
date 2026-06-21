# Native Mobile Parity Plan (MO-12)

Executable implementation plan to bring the native **Android** (Kotlin/Compose) and
**iOS** (SwiftUI) clients under `mobile/` to functional parity with the web learner
PWA. This plan is written to be executed in the dedicated mobile toolchain
(**Android Studio** / **Xcode on macOS**) — it cannot be built or verified in the
Linux CI container used for the web monorepo (Android needs the SDK; iOS requires
macOS/Xcode). Nothing here has been compiled; treat every step as "to implement +
verify on the right toolchain."

Source of the backlog: `docs/audit/mobile-offline-recommendations.md` (item **MO-12**).
Backend contract: `mobile/README.md`, root `firestore.rules`, and
`libs/shared/src/lib/schemas`.

---

## 1. Current state (verified)

| Area                                             | Android (`mobile/android`)                                            | iOS (`mobile/ios`)                          |
| ------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| GCIP tenant sign-in + claims                     | ✅ `AuthRepository` / `LoginViewModel`                                | ✅ `AuthService` / `LoginViewModel`         |
| Published course **list**                        | ✅ `CoursesScreen` / `CoursesViewModel`                               | ✅ `CoursesView` / `CoursesViewModel`       |
| `getCourse` / `listModules`                      | ⚠️ exist in `CourseRepository` but **unwired** (course tap is a TODO) | ⚠️ exist in `CourseService` but **unwired** |
| Course **detail** + module list                  | ❌                                                                    | ❌                                          |
| Content **players** (video/SCORM/cmi5/quiz/game) | ❌                                                                    | ❌                                          |
| Offline reads / download / outbox                | ❌ (Firestore disk cache is on by default but unused for content)     | ❌                                          |
| Push (FCM)                                       | ❌                                                                    | ❌                                          |

So ~15–20% complete: the auth + list slice works; everything content-related is
missing, and the two existing read methods are dead code.

## 2. Goal & guiding decision

Reach parity for the **learner journey**: open a course → see modules (with estimated
time + progress) → launch and complete at least one content type → have reads work
offline and completions sync on reconnect.

**Primary architecture decision — host the web player in a WebView.** The web
monorepo already implements (and CI-verifies) the entire hard part: SCORM/cmi5/xAPI
runtime, quiz player + offline outbox, Firestore offline persistence, the completion
outbox, and the download-for-offline cache (MO-01…MO-10). Re-implementing all of that
natively twice (Kotlin + Swift) is large and duplicative. Instead, the native shells
should **launch the deployed learner PWA's module route inside an authenticated
WebView**, so the players, offline behavior, and sync logic are reused verbatim. Build
genuinely-native screens only for the shell (auth, course list, course detail) where
native UX matters and the data is simple.

A later phase MAY replace the WebView with native players if the embedded UX proves
insufficient — but WebView-first is the fastest, lowest-risk route to parity and keeps
a single source of truth for the learning runtime.

## 3. Backend contract the native clients MUST honor

These are **server-authoritative** and were tightened in this session — native code
that ignores them will be rejected by Firestore rules or diverge from the web:

- **Enrollment writes are field-restricted (MO-10).** `firestore.rules` now allows a
  learner to self-write **only** `cmi.runtime` (+ `lastActivityAt`/`updatedAt`) on
  `/tenants/{t}/courses/{c}/enrollments/{uid}`. `progressPct`, `completed`, `score`,
  and `cmi.completedModuleIds` are **server-only**. A self-`create` must be
  zero-progress with an empty `completedModuleIds`. **Native must never write
  completion/score directly** — doing so will be denied.
- **Completion is a callable.** Report non-quiz completion via the `completeModule`
  callable and quizzes via `submitQuiz` (both recompute progress + grant XP/badges/
  streak server-side, idempotent). Callables are **not** covered by Firestore offline
  persistence → native needs a **completion outbox** (see §5) exactly like the web's.
- **Schema fields to mirror** in `Models.kt` / `Models.swift`:
  `module.contentType`, `assetRef?`, `externalUrl?`, `completion`,
  `module.scormVersion?` (MO-09), `module.estimatedMinutes?` (MO-14),
  `course.availableOffline` (MO-07), and the enrollment shape (`progressPct`,
  `completed`, `score?`, `cmi`).
- **Claims/entitlements are never client-written** (Cloud Functions only). Register
  FCM tokens via the existing `registerFcmToken` callable.
- **App Check**: enable the platform attestation providers (Play Integrity on Android,
  DeviceCheck/App Attest on iOS) since the backend requires App Check.

## 4. Phased implementation

### Phase A — Course detail (both platforms) — wires the existing dead methods

- **Android**: add `CourseDetailViewModel` + `CourseDetailScreen`; on a course tap in
  `CoursesScreen`, navigate and call `CourseRepository.getCourse` + `listModules`.
  Render the module list ordered by `order`, each row showing title, content-type icon,
  `estimatedMinutes` (and a course total = sum), and completion state from the
  learner's enrollment doc.
- **iOS**: mirror with `CourseDetailViewModel` + `CourseDetailView`, navigation from
  `CoursesView`, using `CourseService.getCourse`/`listModules`.
- **Enrollment read**: load `/tenants/{t}/courses/{c}/enrollments/{uid}` to show
  progress/completed per module (read `cmi.completedModuleIds`).

### Phase B — WebView-hosted module player (the parity unlock)

- Add a player screen that hosts a WebView (`WebView` on Android, `WKWebView` on iOS)
  pointed at the learner PWA's module route (e.g.
  `https://<tenant>.soteriaforge.com/courses/{courseId}` deep-linked to the module).
- **Auth bridge**: the WebView must be authenticated as the same user. Options, in
  order of preference: (1) Firebase Auth web session inside the WebView via a
  short-lived custom token minted by a callable, then `signInWithCustomToken` in a tiny
  bridge page; or (2) pass the ID token to a thin web entry that re-establishes the
  session. Ensure the GCIP tenant id is set before sign-in (same as native).
- Because the player is the **web** player, SCORM/cmi5/video/quiz/game, the offline
  xAPI queue, the quiz outbox, the completion outbox, Firestore persistence, and
  download-for-offline all work **inside the WebView** with zero native duplication.
  Enable WebView DOM storage + IndexedDB + service worker (Android:
  `domStorageEnabled`, `databaseEnabled`, modern WebView supports SW; iOS: `WKWebView`
  supports IndexedDB/SW).
- Handle the SCORM iframe sandbox and `window.API` mounting (already done by the web
  `ScormPlayerComponent`) — verify it functions within the embedded WebView.

### Phase C — Native enhancements

- **Offline reads**: Firestore on-disk persistence is enabled by default on both native
  SDKs — explicitly confirm it (Android `FirebaseFirestoreSettings.isPersistenceEnabled`;
  iOS `FirestoreSettings`/`cacheSettings`) so course/module/enrollment reads work
  offline from disk. Optionally pre-warm caches on course open.
- **Completion outbox (native)**: if/when any completion is triggered from native code
  (vs inside the WebView), persist the `completeModule` payload to a local store
  (**Room** on Android, **SQLite/Core Data** on iOS) and retry on connectivity +
  launch — mirroring `ModuleCompletionService.completeWithOutbox`. If completion only
  ever happens inside the WebView, the web outbox already covers it.
- **Push (MO-11)**: native FCM is straightforward — register the device token via the
  existing `registerFcmToken` callable and handle the streak-reminder notifications the
  `sendStreakReminders` scheduled function emits. Request notification permission with a
  tasteful, gesture-driven prompt.
- **Download-for-offline (MO-07)**: optional native mirror; the WebView path already
  inherits the web Cache Storage download if the PWA is used.

### Phase D — Native-native players (optional, later)

Only if the WebView player UX is insufficient: build native video (ExoPlayer /
AVPlayer), a native quiz UI calling `submitQuiz`, and a native SCORM host. Keep
xAPI/completion contracts identical.

## 5. Offline & sync summary

| Concern                                    | Mechanism                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Course/module/enrollment **reads** offline | Native Firestore SDK on-disk persistence (default-on; confirm settings) |
| SCORM/quiz/xAPI offline + sync             | Reused **inside the WebView** (web MO-01/05/08/09/10)                   |
| **Completion** offline (native-triggered)  | Local outbox (Room / SQLite) → `completeModule` on reconnect/launch     |
| Cross-session durability                   | Firestore mutation queue (reads) + outbox (callables)                   |

## 6. Verification (must run on the real toolchain)

- **Android**: `cd mobile/android && ./gradlew :app:assembleDebug` then
  `:app:installDebug` on an emulator/device; drop in a real `app/google-services.json`.
- **iOS** (macOS only): `cd mobile/ios && xcodegen generate` (project is defined in
  `project.yml`) then build in Xcode; drop in `GoogleService-Info.plist`. **This is the
  step that cannot happen on Linux.**
- **Offline manual test**: load a course online, enable airplane mode, confirm the
  course/modules/enrollment still render from the disk cache and the WebView player
  opens cached content; re-enable network and confirm completion synced.
- **Security**: no extra client checks needed — `firestore.rules` enforce tenant
  isolation and the enrollment field restrictions server-side regardless of client.

## 7. Acceptance criteria (from MO-12)

- Both apps: tap a course → see its modules (with estimated time + progress) → launch
  **at least one** content type to completion.
- Reads work offline from the Firestore disk cache.
- Completions made offline reconcile on reconnect (no LRS/LMS divergence — same
  guarantee as web MO-10).
- **iOS builds in Xcode**; **Android assembles** a debug APK.

## 8. Suggested sequencing & effort

1. **Phase A** (course detail, both) — small; wires existing read methods. ~2–3 days.
2. **Phase B** (WebView player + auth bridge) — the parity unlock; the auth bridge is
   the main risk. ~1 week incl. the custom-token callable + WebView storage/SW config.
3. **Phase C** (offline confirm + native push + completion outbox) — ~3–5 days.
4. **Phase D** (native players) — optional, scope later.

Phases A–C deliver the MO-12 acceptance criteria. Phase B's WebView reuse is what keeps
this small: the entire learning runtime (and all of this session's web offline/security
work) is inherited rather than re-implemented per platform.
