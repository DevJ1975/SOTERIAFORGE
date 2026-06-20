# Mobile-First & Offline — Prioritized Recommendations Backlog

A scoped, buildable backlog for making Soteria Assurance genuinely mobile-first
and offline-capable. Derived from the readiness audit (`e2e-test-report.md`) and
competitor benchmarking (`competitor-analysis.md`). Intended consumer: the Angular
developer/architect implementing the next slice.

**Conventions.** Each item has an ID (`MO-NN`), priority (**P0** = ship-blocking
for a credible mobile/offline story · **P1** = high value, next · **P2** = later),
rationale, **scope** (real libs/apps/files in this repo), technical approach
(Angular 20 + Firebase idioms), and **acceptance criteria** (AC) the builder can
verify. Favor self-contained changes that keep CI green (prettier + lint + the
509-test suite + 5 app builds + rules tests).

> **Stack reminders for the builder.** Angular 20 standalone + signals + new
> control flow + `@defer`; NgRx SignalStore; PrimeNG via `@assurance/ui`; PWA via
> `@angular/service-worker` (`apps/learner/ngsw-config.json`, registered in
> `apps/learner/src/app/app.config.ts:31`); Firebase via `@angular/fire`
> (`provideForgeFirebase` in `libs/data-access/src/lib/firestore.providers.ts`).
> Path aliases in `tsconfig.base.json`. Component selectors are `assurance-*`.

---

## Recommended first implementation slice

Build these **first** — they are the smallest set that flips the product from
"desktop site that shrinks" to "installable, navigable, offline-tolerant mobile
PWA," and each is self-contained and CI-safe:

1. **MO-01** — Enable Firestore offline persistence (`persistentLocalCache`).
2. **MO-02** — Fix the PWA manifest + ship real icons (rename, A2HS-ready).
3. **MO-03** — Responsive mobile navigation (bottom-nav) + fix the `course-detail`
   overflow.
4. **MO-04** — Global offline status banner + connection signal.
5. **MO-05** — Migrate the xAPI offline queue to IndexedDB + flush on launch.
6. **MO-08** — Quiz draft autosave + offline submission outbox (stops real data
   loss).

Rationale for the cut: **MO-01** is the single highest-leverage change (one file,
benefits all four web apps, makes every dynamic screen survive a cold offline
load). **MO-02/03/04** are the visible mobile-first floor. **MO-05/08** stop the
two confirmed data-loss paths (xAPI quota drops; lost quiz attempts). Together
they are ~1–2 sprints and leave CI green. Everything below P1 can follow.

---

## P0 — ship-blocking for a credible mobile/offline story

### MO-01 — Enable Firestore offline persistence (IndexedDB cache)

**Priority:** P0. **Rationale:** Confirmed by repo-wide search, **no Firestore
persistence API is used anywhere**; `firestore.providers.ts:28-34` calls bare
`getFirestore()`. Every learner screen (courses, modules, member, enrollment,
leaderboard) does a one-shot/live Firestore read with **no cache**, so a cold
offline load fails and pages show misleading empty states. Competitors all cache
content for offline; this is table stakes.
**Scope:** `libs/data-access/src/lib/firestore.providers.ts` (the single
`provideFirestore` factory used by all four apps via `provideForgeFirebase`).
**Approach:**

- Replace `getFirestore()` with
  `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`
  (import from `@angular/fire/firestore`). Keep the emulator wiring. Multi-tab
  manager avoids the single-tab lock across admin/learner.
- Guard SSR: storefront is SSR — only initialize persistence in the browser
  (`isPlatformBrowser`); on the server fall back to default/memory so prerender
  doesn't touch IndexedDB.
- Pair with making `zodConverter.fromFirestore` (`converters.ts:31`) **skip-and-log
  bad docs in `list()`** instead of throwing, so a stale cached doc can't blank a
  whole screen.
  **AC:**
- With the app loaded once online then taken offline (DevTools → Offline), the
  courses list and a previously-opened course/module **still render from cache**
  (no infinite spinner, no empty-state).
- No SSR regression: `nx build storefront` passes and storefront prerender does
  not throw IndexedDB errors.
- `nx run-many -t test` and the rules tests stay green; a new unit test asserts
  the provider configures `persistentLocalCache` in the browser.

### MO-02 — Fix PWA manifest, ship icons, make installable (A2HS-ready)

**Priority:** P0. **Rationale:** `manifest.webmanifest` still reads
**"Soteria FORGE" / "FORGE"** (product renamed to "Assurance"), and the referenced
icons **do not exist** (`apps/learner/public/` has only `icons-README.txt`, no
`icons/` dir) → install banner shows a broken/no icon. Installability is the PWA's
answer to "native app vs web."
**Scope:** `apps/learner/public/manifest.webmanifest`,
`apps/learner/public/icons/` (new), `apps/learner/src/index.html` (theme-color
already present).
**Approach:**

- Rename `name`/`short_name` to "Assurance" / "Assurance". Keep
  `display:standalone`, `start_url:/`.
- Generate and commit real `icon-192.png`, `icon-512.png`, plus a maskable
  variant and an Apple touch icon; reference them with correct `purpose`. (Use a
  brand placeholder if final art isn't ready — the file must exist and be valid.)
- Verify `<link rel="manifest">` + `<meta name="theme-color">` in `index.html`.
  **AC:**
- Lighthouse "Installable" check passes (manifest valid, icons load, SW present).
- No 404s for any manifest icon in the network panel.
- `nx build learner` passes and the manifest is emitted to `dist/apps/learner`.

### MO-03 — Responsive mobile navigation + fix `course-detail` overflow

**Priority:** P0. **Rationale:** The learner shell (`app.component.ts`) is
header-only with **no nav links at all**; there is no bottom-nav/hamburger and
**zero `@media` queries** in the app or `@assurance/ui`. Worse,
`course-detail.component.ts:122` hard-codes `grid-template-columns: 16rem 1fr` with
no breakpoint → the 256px fixed sidebar overflows phones (most severe layout
defect). Competitors universally ship mobile nav; Duolingo/EdApp use bottom-tab.
**Scope:** `apps/learner/src/app/app.component.ts` (shell) — or add a
`BottomNavComponent` to `libs/ui/src/lib/components/` and use it in the shell;
`apps/learner/src/app/pages/course-detail.component.ts` (grid);
`apps/learner/src/app/pages/tutor.component.ts:36` (`100vh`→`100dvh`).
**Approach:**

- Add a responsive bottom-nav (Dashboard / Courses / Leaderboard / Tutor) shown at
  `max-width: ~48rem` and a top nav above it, using the new control flow + a
  `matchMedia`-backed signal (or pure CSS `@media`). Targets ≥44×44px;
  `aria-current` on the active route; respect safe-area insets
  (`env(safe-area-inset-bottom)`).
- `course-detail`: wrap the 2-col grid in `@media (min-width: 48rem)` so it is a
  single column on phones; ensure the module list stacks above the player.
- Replace `tutor.component.ts` `height: calc(100vh - 6rem)` with `100dvh` to stop
  iOS toolbar clipping.
- Bump sub-44px touch targets flagged in the audit (course-detail module buttons,
  "Start/Back" links, quiz ordering ↑/↓ buttons in
  `libs/player/.../quiz-player.component.ts:292`).
  **AC:**
- At 320px and 375px widths, `course-detail` shows **no horizontal scroll** and the
  player is full-width above a stacked module list.
- Bottom-nav appears on small viewports, is keyboard-reachable, marks the active
  route, and all targets are ≥44px (verify in DevTools device mode).
- Existing learner a11y specs still pass; add a test asserting the nav renders the
  four destinations.

### MO-04 — Global offline status banner + connection signal

**Priority:** P0. **Rationale:** No component uses `navigator.onLine`; data
failures render misleading empty states ("No published courses available yet.").
Every competitor surfaces connectivity state; an offline indicator is the minimum
honest UX once caching exists (MO-01).
**Scope:** new `libs/shared` (or `libs/ui`) `ConnectivityService` (signal-based);
consume in `apps/learner/src/app/app.component.ts` shell; optionally a reusable
`OfflineBannerComponent` in `@assurance/ui`.
**Approach:**

- `ConnectivityService` exposes an `online` signal initialized from
  `navigator.onLine` and updated on `window:online`/`offline` (SSR-guarded; assume
  online on the server).
- Render a non-blocking banner in the shell when offline ("You're offline — showing
  saved content. Changes will sync when you reconnect."), with `role="status"` /
  `aria-live="polite"`.
- Replace silent `catch`→`console.*` in learner pages with offline-aware states
  (distinguish "offline" from "empty" from "error").
  **AC:**
- Toggling DevTools offline shows the banner within ~1s and hides on reconnect.
- Courses/dashboard show an offline-specific message (not the empty-state copy)
  when offline with a cold cache.
- `ConnectivityService` has a unit test (jsdom dispatch of `online`/`offline`).

### MO-05 — Move xAPI offline queue to IndexedDB + flush on launch

**Priority:** P0. **Rationale:** `OfflineXapiQueue`
(`libs/standards/src/lib/offline-xapi-queue.service.ts`) is the product's one real
offline mechanism but is **localStorage-only** (~5MB, synchronous) and
**silently drops** statements on quota (`:129-131`); it also only flushes on an
`offline→online` transition, so reopening the app already-online **never drains the
queue**. The file's own TODO calls for IndexedDB. This is a confirmed data-loss path.
**Scope:** `libs/standards/src/lib/offline-xapi-queue.service.ts` (keep the public
API `enqueue`/`peekAll`/`size`/`flush` identical — `xapi-client.ts` depends on it).
**Approach:**

- Back the queue with IndexedDB (a tiny wrapper or `idb`-style code; no heavy dep
  needed). Keep methods async-compatible.
- Add a **flush on startup** (in addition to the `window:online` listener) so a
  queue persisted in a prior session drains when the app reopens online.
- On quota/error, retain rather than silently drop (cap with a max-age/size policy
  and surface a count via a signal for MO-04's banner — "N updates pending").
  **AC:**
- Existing `offline-xapi-queue.service.spec.ts` passes (or is updated 1:1) and a
  new test verifies persistence survives a simulated reload and the startup flush.
- Statements queued offline are sent after the app is closed and reopened while
  online (not only on a live transition).
- No statement is dropped on simulated quota error (kept for retry).

---

## P1 — high value, next

### MO-06 — Service-worker data caching for Firestore/API reads (`dataGroups`)

**Priority:** P1. **Rationale:** `ngsw-config.json` caches the app shell + media
but has **no `dataGroups` for data**. With MO-01 covering Firestore SDK reads, the
SW should still cache callable/HTTP responses (tutor, analytics) and any REST so
the app is resilient. Competitors cache content aggressively.
**Scope:** `apps/learner/ngsw-config.json`.
**Approach:** Add `dataGroups` with `freshness` strategy for dynamic data
(short `maxAge`, `timeout` fallback to cache) and `performance` for rarely-changing
catalog assets. Keep the existing `content-media` group. Note Firestore SDK traffic
is handled by MO-01; target callable endpoints and any same-origin API.
**AC:** With the SW active and offline, a previously-loaded tutor transcript or
analytics view serves from cache; `nx build learner --configuration=production`
emits the updated `ngsw.json`.

### MO-07 — "Download for offline" course packaging + offline content flag

**Priority:** P1. **Rationale:** The clearest competitor pattern (EdApp, Docebo,
Moodle, Absorb, 360Learning) is **explicit download-on-WiFi → learn offline → sync**.
Today only previously-_viewed_ same-origin media is incidentally cached, and the
**default video path is YouTube/Vimeo, which cannot be cached**. Offline is also
**opt-in per course** at every vendor.
**Scope:** model flag in `libs/shared` schemas (e.g. `availableOffline` /
`allowDownload` on course/module) + admin toggle in
`apps/admin/src/app/pages/course-editor.component.ts`; a `DownloadService` in
`@assurance/lms-core` or `@assurance/player`; download UI on
`apps/learner/.../course-detail.component.ts`; cache via the Cache Storage API +
IndexedDB manifest of downloaded items.
**Approach:**

- Add an author-set `availableOffline` flag; only flag courses whose content is
  cacheable (uploaded/same-origin media, SCORM zips) — surface a "requires
  connection" note for YouTube/Vimeo/iframe content (mirrors EdApp/Docebo honesty).
- "Download" button fetches module assets into a named cache and records a manifest
  (course id, module ids, sizes, timestamp) in IndexedDB; show downloaded/queued/
  size + a remove action and a storage-quota check (`navigator.storage.estimate()`).
- Prefer self-hosted/Storage-served video for downloadable courses; document the
  YouTube/Vimeo limitation.
  **AC:** An author can mark a course offline-available; a learner can download it on
  WiFi, go offline, and **open and play** its modules; downloaded state and size are
  visible and removable; non-cacheable content is clearly flagged.

### MO-08 — Quiz draft autosave + offline submission outbox

**Priority:** P1 (in first slice). **Rationale:** Confirmed worst data-loss path:
quiz answers live only in volatile signals
(`libs/player/.../quiz-player.component.ts:377-384`) — refresh/close/background
loses them — and `submitQuiz` **hard-fails offline** with no queue. Moodle's
offline-quiz-then-sync is the model.
**Scope:** `libs/player/src/lib/quiz-player.component.ts` (draft autosave);
`libs/lms-core/src/lib/quiz-submission.service.ts` (outbox);
reuse the IndexedDB wrapper from MO-05.
**Approach:**

- Autosave in-progress answers to IndexedDB (keyed by `tenantId:uid:quizId`) on
  every change (debounced); restore on load; clear on successful submit.
- Wrap `submitQuiz`: if offline or the callable rejects, persist the submission to
  an **outbox** and retry on `online`/launch (same pattern as MO-05); show
  "Submitted — will sync when online" rather than "try again."
- Because grading is server-authoritative, the outbox just defers the callable;
  reconcile the returned grade when it eventually runs. Decide and document the
  conflict/attempt-count policy (tie into the non-transactional attempts gate noted
  in the audit).
  **AC:** Answering a quiz, killing the tab, and reopening **restores the draft**;
  submitting offline queues the attempt and it is sent (and graded) on reconnect; a
  unit test covers draft round-trip and offline-queue-then-flush.

### MO-09 — Persist SCORM/cmi5 runtime state locally + fix SCORM resume

**Priority:** P1. **Rationale:** Two compounding defects: (a) **SCORM resume is
dead** — `ModulePlayerComponent` never passes `[initialCmi]`
(`libs/player/.../module-player.component.ts:59-64`), so saved
`suspend_data`/bookmark is never restored; (b) SCORM commits go to **Firestore only**
with no local fallback, so going offline mid-SCO loses progress. The xAPI queue
does not cover CMI. Offline SCORM is a marquee competitor feature (Docebo,
Cornerstone, Litmos).
**Scope:** `libs/player/src/lib/module-player.component.ts` (wire `[initialCmi]`
from the loaded enrollment; pass real `scormVersion` from the module rather than the
hardcoded `'2004'` at `:61`); `libs/standards/src/lib/scorm-runtime.service.ts`
(local commit buffer); `libs/lms-core` enrollment write path (offline-tolerant via
MO-01 + outbox).
**Approach:** Load the saved CMI from the enrollment and pass it as `initialCmi` so
resume works; buffer commits to IndexedDB and reconcile to Firestore when online
(persistence from MO-01 helps but a durable outbox guarantees survival across
reloads). Also fix the SCORM 1.2 score mis-scaling (`scorm-runtime.service.ts:145-147`,
raw 0–100 assigned to the 0–1 `scaled` signal) while in this code.
**AC:** Relaunching a partially-completed SCORM module **resumes** at the saved
bookmark/suspend_data; commits made offline are not lost after a reload and appear
in the enrollment on reconnect; a 1.2 package reports a correct scaled score.

### MO-10 — Make completion writes offline-durable (outbox) + close the enrollment-forgery gap

**Priority:** P1. **Rationale:** `PlayerProgressService.recordCompletion` swallows
a failed server `complete()` while still emitting the xAPI `completed`, so offline
the LRS says "completed" but the authoritative LMS never recorded it (divergence).
Separately, the audit found **learners can forge enrollment completion/score
directly** (`firestore.rules:75-76` has no field-level restriction) — relevant
because any offline-write design must not widen this hole.
**Scope:** `libs/player/src/lib/player-progress.service.ts`;
`libs/lms-core/.../module-completion.service.ts`; `firestore.rules` (field-level
restriction on `enrollments` writes); reuse MO-05 outbox.
**Approach:** Queue the `completeModule` callable in the outbox so completion
survives offline and reconciles on reconnect; ensure the xAPI `completed` is only
emitted once the authoritative completion is queued/confirmed (or mark it pending).
Tighten rules so clients cannot write `progressPct`/`completed`/`score`/
`cmi.completedModuleIds` (make completion server-only), keeping the offline path
flowing exclusively through the queued callable.
**AC:** Completing a module offline records completion on the server after
reconnect (no LRS/LMS divergence); a rules test proves a client cannot self-write
`completed:true`/`score` directly; existing completion specs pass.

### MO-11 — Push reminders / streak nudges via FCM (behavior-triggered)

**Priority:** P1. **Rationale:** FCM is in the stack but there is **no
reminder/streak pipeline**; gamification streaks exist but aren't reinforced.
Duolingo's capped (≤2/day), habit-window, behavior-triggered push with 7-day decay
is the gold standard; every competitor ships push.
**Scope:** `apps/functions/src/` (new scheduled/triggered functions — note: there
is currently **no `onSchedule`/cron anywhere**, so this also unblocks MO-13);
`apps/learner` FCM token registration + permission UX; reuse member streak data.
**Approach:** Register FCM tokens on the learner (with a tasteful permission
prompt, not on first load). Add a scheduled function that, per
streak/habit-window, sends a capped daily nudge ("Keep your N-day streak"), with a
7-day decay and a per-user frequency cap. Keep messages behavior-triggered (due
soon, streak at risk) rather than broadcast.
**AC:** A learner who opts in receives a streak-risk reminder; daily cap is
enforced; opting out stops them. (Live FCM isn't CI-testable — unit-test the
selection/cap logic; document the live verification step.)

---

## P2 — later

### MO-12 — Native mobile apps to parity (players/quizzes/offline)

**Priority:** P2. **Rationale:** Native scaffolds are ~15–20% complete (auth +
course list; `getCourse`/`listModules` exist but are **dead code**; course tap is a
`TODO`). Native Firestore SDKs give them _free_ on-disk persistence the web lacks —
a head start. Most serious LMS competitors are native-first.
**Scope:** `mobile/android` (Compose), `mobile/ios` (SwiftUI) — wire the existing
repository methods into course-detail/module screens; add a WebView-hosted player
that reuses the web `@assurance/player`, or native players; mirror the offline
outbox.
**Approach:** First wire course detail + modules (methods already exist); host the
web player in a WebView for fast parity; rely on default Firestore persistence for
reads and add an outbox for writes. Compile the iOS project (authored on Linux,
never built).
**AC:** Both apps open a course, list modules, and launch at least one content
type; reads work offline from the Firestore disk cache; iOS builds in Xcode.

### MO-13 — Reset scheduled leaderboards + fix client/server level mismatch

**Priority:** P2. **Rationale:** `daily`/`weekly` leaderboards **never reset**
(no cron) so all three boards equal `allTime` — misleading on a gamified mobile
home screen. Client vs server level curves disagree at thresholds
(`apps/functions/src/lib/gamification.ts:11` raw float vs client floored), causing
visible level flicker. Both undercut the mobile gamification loop.
**Scope:** `apps/functions/src/lib/gamification.ts` (curve + scheduled reset, built
on the cron added in MO-11); `libs/gamification/src/lib/leveling.ts` (single shared
curve).
**Approach:** Have the server import the shared `levelForXp` (one source of truth);
add a scheduled rollover (or compute boards from time-windowed events) for
daily/weekly.
**AC:** Server and client report the same level at boundary XP values (282, 519,
1118…); daily/weekly boards differ from `allTime` after a rollover; unit tests
cover the unified curve and add server-path tests.

### MO-14 — Microlearning: stepped one-block-per-screen player + lesson length

**Priority:** P2. **Rationale:** Competitors converge on ~5-minute lessons and
stepped, one-thing-per-screen navigation (Rise Stepped mode; EdApp). The current
module player renders content whole; mobile benefits from a paged, big-target flow.
**Scope:** `libs/player/src/lib/module-player.component.ts` (optional stepped mode);
content model in `libs/shared` (lesson/block notion + estimated duration).
**Approach:** Add an opt-in stepped renderer (one block per screen, large
"Continue" target, progress dots) and surface estimated lesson minutes. Keep the
existing whole-page mode for desktop/SCORM.
**AC:** A module can render in stepped mode on mobile with one block per screen and
a clear next action; estimated duration shows on the course/module list.

### MO-15 — Storefront SEO + mobile polish (SSR'd dynamic content, OG/sitemap, `@media`)

**Priority:** P2. **Rationale:** Storefront is the public B2C/B2B surface but
**dynamic catalog/account content is not server-rendered** (empty Firebase config
→ data fetched only in `afterNextRender`), and there is **no Open Graph / Twitter
/ canonical / robots / sitemap**. It is fluid but has **zero `@media`/`clamp`**.
**Scope:** `apps/storefront` — render-time Firebase config so catalog SSRs;
`pages/*` meta (OG/Twitter/canonical); `public/robots.txt` + a sitemap; add
`@media`/`clamp()` and a wrapping/hamburger header.
**Approach:** Provide a real (public, read-only) Firebase config at render so the
catalog list is in the server HTML for crawlers; add social/canonical meta and a
sitemap; introduce fluid type and a responsive header.
**AC:** View-source on `/catalog` shows product listings server-rendered; a link
preview (OG) resolves; `robots.txt`/sitemap exist; storefront passes a mobile
Lighthouse SEO check; `nx build storefront` stays green.

---

## Sequencing summary

| Wave                         | Items                                    | Theme                                                                       |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| **First slice (P0 + MO-08)** | MO-01, MO-02, MO-03, MO-04, MO-05, MO-08 | Offline data floor, installable PWA, mobile nav, offline UX, stop data loss |
| **Next (P1)**                | MO-06, MO-07, MO-09, MO-10, MO-11        | Download-for-offline, durable SCORM/completion, push nudges                 |
| **Later (P2)**               | MO-12, MO-13, MO-14, MO-15               | Native parity, gamification correctness, microlearning, storefront SEO      |

All items are scoped to existing files/libs and designed to land incrementally
without breaking the green CI suite. The first slice is the recommended starting
point and is independently shippable.
