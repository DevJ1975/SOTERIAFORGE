# E2E Test & Feature-Readiness Audit

End-to-end audit of the Soteria Assurance LMS as of branch
`claude/hopeful-cerf-460pp1` (audit date 2026-06-20). This report covers (1) the
automated suite that was actually executed with real pass/fail results, and (2) a
feature-by-feature readiness audit with mobile-first and offline maturity scores.

> **Scope note.** A full manual runtime click-through (Firebase emulators + the
> four Angular apps) is **not feasible headlessly** and was **not performed** —
> nothing in this report is a fabricated runtime observation. "E2E" here means
> the automated CI-equivalent suite below **plus** a static, source-grounded
> readiness audit. Every audit finding cites a file (and, where load-bearing, a
> line) in this repo.

---

## 1. Automated suite — real results

Environment: Node 22.22.2, npm 10.9.7 (repo requires Node ≥20.11). Dependencies
installed with the CI command.

| Step                                  | Command                                                           | Result           | Notes                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                               | `npm ci --legacy-peer-deps`                                       | ✅ PASS (exit 0) | 2325 packages added in ~2 min. `npm audit` reports 149 advisories (4 low, 99 moderate, 43 high, 3 critical) — transitive; not triaged in this pass.           |
| Format                                | `npx prettier --check .`                                          | ✅ PASS          | "All matched files use Prettier code style!"                                                                                                                  |
| Lint                                  | `npx nx run-many -t lint --parallel=3`                            | ✅ PASS          | "Successfully ran target lint for 18 projects."                                                                                                               |
| Unit tests                            | `npx nx run-many -t test --ci --parallel=2`                       | ✅ PASS (exit 0) | **509 tests across 69 suites in 17 projects, 0 failures.**                                                                                                    |
| Build (learner)                       | `npx nx build learner`                                            | ✅ PASS (exit 0) | Output emitted to `dist/apps/learner`. Non-blocking warnings: `@rive-app/canvas`, `phaser`, `pixi.js` flagged "not ESM" (optimization-bailout warnings only). |
| Build (functions)                     | `npx nx build functions`                                          | ✅ PASS (exit 0) | Clean.                                                                                                                                                        |
| Build (admin, superadmin, storefront) | `npx nx run-many -t build --projects=admin,superadmin,storefront` | ✅ PASS          | Run for completeness beyond the brief's required two targets.                                                                                                 |

### What ran vs. what did NOT run

- **Ran:** install, prettier, lint, the full unit-test suite (not a subset — it
  completed in time), and builds for **all five** app targets.
- **Did NOT run (and not faked):**
  - **Firestore rules tests** (`nx test-rules data-access`) — these require the
    Firestore emulator under a JRE (`firebase emulators:exec`). The emulator was
    not started in this pass, so the rules suite (`firestore.rules.spec.ts`) is
    **statically reviewed only** (see §2). This is also why the unit run shows
    **17** projects, not 18: `data-access`'s rules target is emulator-gated.
  - **Playwright e2e** (`learner-e2e`) — needs a served app + browser; the CI
    workflow itself only runs this on `main`/manual dispatch, not per-PR.
  - **Live runtime click-through** of any app — not feasible headlessly.

### Test distribution (per the run)

71 `*.spec.ts` files exist in the workspace; the unit run executed 69 suites
(the 2 emulator-gated `firestore.rules.spec.ts` / and the Playwright
`example.spec.ts` are excluded from `nx test`). Coverage is concentrated in
`shared` (90 tests), `admin` pages (54), `standards` (43), `gamification` (36),
and `learner` pages (32). The suite is **green and meaningful** for unit-level
logic, but note the gaps called out per-area below — almost none of it exercises
responsive layout, `navigator.onLine`, or offline fallbacks.

---

## 2. Feature-by-feature readiness audit

Each area is scored **Mobile-first** and **Offline** on a 0–5 scale
(0 = absent, 3 = partially viable, 5 = market-leading). Scores reflect the
learner-facing **web** surface unless noted; admin/superadmin offline is N/A
(authoring tools).

### 2.0 Maturity scorecard (summary)

| Area                                       | Mobile-first |    Offline     | Headline                                                                                                 |
| ------------------------------------------ | :----------: | :------------: | -------------------------------------------------------------------------------------------------------- |
| Multi-tenancy & auth/claims                |     N/A      |       1        | Sound online; guards `await refreshClaims()` need network; no persisted state.                           |
| Content & delivery (courses/modules/video) |      2       |      1.5       | Fluid-tolerant pages; SCORM resume broken; YouTube/Vimeo default video uncacheable.                      |
| Standards engine (SCORM/cmi5/xAPI/badges)  |      3       |       2        | Responsive iframes; xAPI queue is the bright spot; SCORM CMI not persisted locally; SCORM resume broken. |
| Quizzes & grading                          |      2       |       0        | No draft persistence + hard-fail submit offline = full attempt loss; client-readable answer keys.        |
| Gamification (XP/streaks/leaderboard)      |      2       |       1        | Server-pull XP; client/server level-curve mismatch; daily/weekly boards never reset.                     |
| Interactive games (Rive/Phaser/Unity)      |      3       |       1        | Touch works, fluid; no canvas resize; games grant 0 XP; `sort_buckets` never scored.                     |
| AI tutor (RAG)                             |      2       |       0        | Hard network dependency, only `error` state; `100vh` host clips on iOS.                                  |
| Payments/entitlements (Stripe)             |      3       |       1        | Hosted checkout (fine on mobile); no subscription revocation; claims readable offline.                   |
| Storefront (SSR/SEO)                       |      3       |       0        | Fluid but no `@media`; dynamic content not server-rendered; no OG/sitemap; no PWA.                       |
| Admin & superadmin consoles                |      1       |      N/A       | Desktop-only `p-table`s, no breakpoints; no unsaved-changes/confirm guards.                              |
| PWA / service worker                       |     1.5      |      1.5       | Shell + media cached; **no Firestore/API data caching**; stale manifest; missing icons.                  |
| Native mobile scaffolds                    |  foundation  | 1 (incidental) | Auth + course list only (~15–20%); detail/players/quizzes absent; free Firestore disk cache.             |
| **Learner UI shell (overall)**             |   **1.5**    |    **1.5**     | No responsive nav, no offline indicator, no A2HS prompt.                                                 |

> The data layer is the single biggest offline lever: **Firestore offline
> persistence is not enabled anywhere** (confirmed by a repo-wide search — see
> §2.1), so every dynamic screen fails on a cold offline load.

---

### 2.1 Multi-tenancy & auth/claims

**Implemented.** Subdomain tenant resolution via the pure
`resolveTenantFromHost` (`libs/shared/src/lib/util/tenant-resolution.ts:31-71`,
SSR/Functions-safe), surfaced as signals by `TenantService`
(`libs/auth/src/lib/tenant.service.ts`). GCIP multi-tenancy: `AuthService`
stamps `auth.tenantId` with the mapped GCIP tenant before sign-in
(`libs/auth/src/lib/auth.service.ts:49-66`). Custom-claims schema is zod-validated
(`libs/shared/src/lib/schemas/identity.ts:9-23`) with a `.refine` requiring
`tenantId` for non-superadmin roles; `parseClaims` rejects malformed tokens
(`libs/auth/src/lib/claims.ts`). Role-based guards in `libs/auth/src/lib/guards.ts`.
All Firestore paths are tenant-qualified via `FsPaths`
(`libs/data-access/src/lib/paths.ts`).

**Tests.** `tenant-resolution.spec.ts`, `claims.spec.ts` (parse/role/tenant-access
incl. null cases), `admin-api.spec.ts`. **Gaps:** no `guards.spec.ts` /
`auth.service.spec.ts` — the guard redirect logic and the just-provisioned-user
token-refresh race are untested.

**Risk.** `gcipTenantId` returns `null` when a tenant is missing from
`gcipTenantMap`, and sign-in then silently falls back to the project-level pool
(`tenant.service.ts:23-27`, `auth.service.ts:50-52`) — a misconfigured tenant
could auth against the wrong pool. Guards default to `forceRefresh=false`, so a
just-changed role can lag until token expiry (low security risk — rules are
authoritative).

**Mobile:** N/A. **Offline:** **1/5.** Guards `await refreshClaims()`, which
needs the network for a forced refresh and can hang/deny offline; tenant branding
(`tenant-theme.bootstrap.ts`) silently falls back to the default theme offline;
no persisted auth/tenant state beyond Firebase's own token cache.

### 2.2 Content & delivery (courses / modules / video)

**Implemented.** `BaseRepository<T>` (`libs/data-access/src/lib/base-repository.ts`)
binds a tenant-scoped path + zod converter; `getById/watch/list/set/update/remove`.
Concrete repos for course/module/enrollment etc. `zodConverter` validates on read
**and** write (`libs/data-access/src/lib/converters.ts`). Learner pages
(`courses.component.ts`, `course-detail.component.ts`) load published courses,
auto-enroll, watch live enrollment, and render the unified player.

**Tests.** `converters.spec.ts`, `leaderboard.repository.spec.ts`,
`courses.component.spec.ts`, `course-detail.component.spec.ts`. Most concrete
repos lack direct unit tests (covered indirectly + by the rules suite).

**Risk (load-bearing).** `zodConverter.fromFirestore` **throws** on schema drift
(`converters.ts:31`); a single legacy/malformed doc rejects the whole
`list()`/`watch()` emission rather than skipping the bad record — all-or-nothing
reads, which becomes worse once a cache serves stale data.

**Mobile:** **2/5.** Pages use `max-width + margin:auto + padding` and one
genuinely fluid grid (`courses.component.ts:77`,
`repeat(auto-fill, minmax(18rem,1fr))`), but **no breakpoints**, and
`course-detail.component.ts:120-124` hard-codes `grid-template-columns: 16rem 1fr`
with **no `@media` to collapse it** — this overflows phones (most severe layout
defect). **Offline:** **1.5/5.** Reads have no offline fallback; `catch` blocks
only `console.*` and render a misleading empty state (e.g. "No published courses
available yet."). Default video path is YouTube/Vimeo (cross-origin), which the
service worker cannot cache (see §2.11).

### 2.3 Standards engine (SCORM / cmi5 / xAPI / Open Badges)

**Implemented.** `ScormPlayerComponent` mounts the `scorm-again` API on `window`
before setting `iframe.src` (correct ordering;
`libs/standards/src/lib/scorm-player.component.ts`), driven by
`ScormRuntimeService` (dynamic `scorm-again` import; SCORM 1.2 + 2004). cmi5 via
`buildLaunchUrl`/`parseLaunchParams` (`cmi5.ts`) and `Cmi5LauncherComponent`.
`XapiClient` builds tenant-stamped statements and posts to the `ingestStatement`
callable; offline-aware (`xapi-client.ts:124-143`). `OfflineXapiQueue` persists
statements to localStorage and auto-flushes on `window:online`
(`offline-xapi-queue.service.ts`). Manifest parsing in `manifest.ts`. (Open
Badges live in `libs/data-access/.../badge.repository.ts`, not in `standards`.)

**Tests.** Strong for pure/queue logic: `cmi5.spec.ts`, `manifest.spec.ts`,
`xapi-client.spec.ts` (incl. offline enqueue), `offline-xapi-queue.service.spec.ts`
(incl. online-event flush). **Gaps:** `ScormRuntimeService`, `Cmi5LaunchService`
have **no specs**; player specs are shallow (runtime mocked).

**Risk (load-bearing).**

1. **SCORM resume is dead end-to-end** — `ModulePlayerComponent` binds the SCORM
   player but **never passes `[initialCmi]`** (`libs/player/src/lib/module-player.component.ts:59-64`),
   so saved `suspend_data`/bookmark in Firestore is never restored; every launch
   starts fresh.
2. **SCORM 1.2 score mis-scaling** — raw 0–100 is assigned to the `scaled` (0–1)
   signal (`scorm-runtime.service.ts:145-147`).
3. **cmi5/Unity `completed` never fires** — no `postMessage` listener exists in
   `cmi5-launcher.component.ts`, yet `ModulePlayerComponent` binds `(completed)`;
   completion via that side-channel is dead code.
4. `OfflineXapiQueue` is localStorage-only (~5 MB): `_write` **silently drops** on
   quota (`offline-xapi-queue.service.ts:129-131`), and it only drains on an
   `offline→online` transition — reopening the app already-online does not flush.

**Mobile:** **3/5.** Iframes are uniformly responsive (`width:100%` +
`aspect-ratio:16/9`), no fixed-px or hover-only traps; capped by a hard 16:9 lock
and zero handling for legacy fixed-size SCORM or portrait orientation.
**Offline:** **2/5.** xAPI has a real persisted queue (the bright spot), but
SCORM CMI persists to Firestore only with no local fallback (data loss mid-SCO),
cmi5/Unity need a live launch token, and the queue has the quota/startup gaps above.

### 2.4 Quizzes & grading

**Implemented.** Pure `gradeQuiz` (`libs/shared/src/lib/util/quiz-grading.ts`)
grades 6 question types (mcq, true_false, multi_select, ordering, matching,
fill_in), all-or-nothing per question, `passed = scorePct >= passThreshold`.
**Grading is server-authoritative**: `QuizPlayerComponent` collects answers and
calls `submitQuiz`; the function reloads the quiz and re-grades
(`apps/functions/src/quizzes/submit-quiz.ts:43-63`). `maxAttempts` enforced via a
per-enrollment counter; on pass, routes through `recordModuleCompletion` and
writes an xAPI passed/failed statement.

**Tests.** `quiz-grading.spec.ts` (mcq, multi_select, fill_in, ordering,
threshold), `quiz-submission.service.spec.ts` (transport),
`quiz-player.component.spec.ts`. **Gaps: no test for `matching` or `true_false`
grading, and no backend test for `submit-quiz.ts`** (attempt enforcement, tenant
check, XP math, LRS write all untested).

**Risk (load-bearing).**

1. **Answer keys are readable by the client.** `quizzes` docs carry `isCorrect`
   flags / `answerKey`, and learners have `read` on them (`firestore.rules:82-85`).
   A learner can read correct answers from Firestore before submitting — a real
   anti-cheat gap (keys should be stripped or moved server-only).
2. **`matching` grading depends on a brittle, unenforced string contract.** The
   player encodes `optionId + ':' + rightText` (`quiz-player.component.ts:183`,
   `:68`) and the server compares as opaque strings (`quiz-grading.ts:84`);
   nothing validates `answerKey` is stored in that exact format → a natural
   `leftId:rightId` authoring choice grades every answer wrong. Same fragility
   for `ordering` (key must be option ids, in order).
3. **`randomize` flag is dead** (defined in `quiz.ts:35`, never read).
4. Attempts RMW in `submit-quiz.ts` is non-transactional → concurrent submits can
   both pass the `maxAttempts` gate.

**Mobile:** **2/5.** Container is fluid (`max-width:48rem`), native `<select>` for
matching (good on touch), but ordering ↑/↓ buttons are `padding:0.125rem 0.375rem`
(`quiz-player.component.ts:292`) — **far below the ~44px touch target** — and the
matching left column `min-width:8rem` crowds small phones. **Offline:** **0/5.**
**No in-progress draft persistence** — all answer state is volatile component
signals (`:377-384`); refresh/close/background loses the attempt. Submission is a
callable that **fails hard offline** with no queue/retry — combined, an offline
learner loses the entire attempt.

### 2.5 Gamification (XP / streaks / leveling / leaderboard / badges)

**Implemented.** XP curve, streaks, leveling, "1224" ranking on the client
(`libs/gamification/src/lib/{leveling,streaks,leaderboard}.ts`); **authoritative**
grants server-side in a transaction (`apps/functions/src/lib/gamification.ts`
`awardToMember`, `upsertLeaderboards`), badges in
`apps/functions/src/lib/completion.ts`. Anti-cheat is sound for rewards: `members`
and `leaderboard` writes are locked in rules; App Check is wired in prod.

**Tests.** Strong on pure helpers (`leveling.spec.ts`, `streaks.spec.ts` —
timezone/leap-year, `leaderboard.spec.ts`, `xp.service.spec.ts`). **Zero tests on
the authoritative server paths** (`awardToMember`, `upsertLeaderboards`,
`recordModuleCompletion`).

**Risk (load-bearing).**

1. **Client and server compute different levels at thresholds.** Client advances
   when `floor(100*(N+1)^1.5) <= xp`; server uses a raw float without floor
   (`apps/functions/src/lib/gamification.ts:11`). Confirmed mismatches at xp 282,
   519, 1118, 1469, 1852… — e.g. at 282 XP the badge shows Level 2 while the
   server stores Level 1. Two implementations documented "keep in sync" but drift.
2. **`daily`/`weekly` leaderboards never reset.** `upsertLeaderboards` writes
   cumulative all-time XP into all three period docs and there is **no scheduled
   rollover** anywhere in `apps/functions` — all three boards are identical to
   `allTime`; the daily/weekly UI is misleading.
3. **Race:** `recordModuleCompletion`'s enrollment read-modify-write is outside a
   transaction; concurrent completions can corrupt progress/streak.
4. **`XpService.awardXp` has no consumers** (dead optimistic-UI code), and its
   doc claims server "rate limiting and duplicate-event detection" that **does not
   exist** (only per-quiz `maxAttempts`).

**Mobile:** **2/5.** `LeaderboardComponent` is a flex `<ol>` (`max-width:36rem`)
that degrades acceptably, but long names have no truncation (overflow risk) and no
min tap sizing; no breakpoints. `XpBadgeComponent` is a fine presentational pill.
**Offline:** **1/5.** All reads hit Firestore with no persistence; XP is
server-pull → offline shows stale-or-nothing.

### 2.6 Interactive games (Rive / Phaser / Unity)

**Implemented.** `card-game.model.ts` defines a 4-variant union with a thorough
pure validator. `PhaserHostComponent` implements all four kinds (lazy Phaser
import, SSR/jsdom-guarded). `RiveCharacterComponent` (lazy `@rive-app/canvas`).
`UnityEmbedComponent` (sandboxed responsive iframe; cmi5/xAPI reporting bypasses
postMessage straight to the LRS — correct).

**Tests.** `card-game.model.spec.ts` (comprehensive validation),
`unity-embed.component.spec.ts`. Phaser/Rive are deliberately not unit-tested
(WebGL/canvas unavailable in jsdom) → the bulk of game interactivity has no
automated coverage (deferred to e2e).

**Risk (load-bearing).**

1. **`sort_buckets` never scores correctness** — it round-robins cards into
   buckets and ignores `correctCardIds` at play time
   (`phaser-host.component.ts:522-544`); the game completes regardless. README
   claims drag-and-drop; implementation is click-to-cycle (doc/impl mismatch).
2. **No score/result emitted** from any Phaser/Rive game — `(completed)` is a bare
   `void`; nothing gradeable flows out (Unity defers to cmi5).
3. **Game completion grants 0 XP/badges** — `GamePlayerComponent` fabricates a
   `Module` with `xpReward:0`, `badgeRefs:[]` (`libs/player/src/lib/game-player.component.ts:116-129`);
   Rive games never emit completion at all.

**Mobile:** **3/5.** Layout fluid, pointer events work on touch, but Phaser canvas
is sized once at init (`phaser-host.component.ts:149-151`) with **no resize/
orientation handling**, small fixed 11–14px fonts crowd phones, and Unity WebGL in
a mobile iframe is a real perf risk with no capability gating. **Offline:** **1/5.**
Engines are lazily fetched; once browser-cached, Phaser card games (data-driven)
could run offline, but there's no pre-cache and Unity/Rive assets are remote.

### 2.7 AI tutor (RAG)

**Implemented.** End-to-end provider-abstracted RAG. Client `TutorService.ask()`
→ `askTutor` callable → server (`apps/functions/src/ai/tutor-flow.ts`) reads
`tenantId` from the **auth claim** (not the client), embeds, `retrieveTopK`,
grounds, persists both turns. Tenant isolation is server-authoritative
(`retrieval.ts:21-24`). Pluggable providers (deterministic local default; Vertex
Gemini 1.5 + text-embedding-004 gated on `ASSURANCE_AI_PROVIDER=vertex`); both
guardrail against empty context (no-hallucination refusal).

**Tests.** `tutor.service.spec.ts`, `ingest.service.spec.ts` (client). **No
server-function tests** (`askTutor`, `ingestKnowledge`, `retrieveTopK`); no
`tutor-chat.component` test.

**Risk.** `retrieveTopK` loads the entire tenant vector collection into memory and
ranks in JS (`retrieval.ts:21-34`) — fine for emulator/small tenants, won't scale
(swap to `findNearest`). `LocalEmbeddingProvider` is lexical bag-of-words; mixing
local-embedded vectors with Vertex queries silently degrades retrieval (no
embedder stamp on vectors). `askTutor` has no rate limit / input cap.

**Mobile:** **2/5.** Fluid flex with `max-width:75%` bubbles, but no breakpoints,
single-line `<input>` (no multiline/auto-grow), and the host page is
`height: calc(100vh - 6rem)` (`apps/learner/.../tutor.component.ts:36`) — fragile
under mobile browser chrome and the iOS keyboard (use `dvh`). **Offline:** **0/5.**
Hard network dependency; on failure sets `error` (the only handling) — no offline
detection, queue, or cached transcript.

### 2.8 Payments / entitlements (Stripe)

**Implemented.** Server-authoritative. Pure `isEntitled`/`resolveAccess`
(`libs/payments/src/lib/entitlements.ts`). `CheckoutService` calls callables and
redirects (SSR-safe). `EntitlementStore` (signal store from claims) +
`entitlementGuard`. Server: `createCheckoutSession` looks up `stripePriceId`
server-side; webhook verifies signature, is idempotent via `stripeEvents/{id}`,
and grants on `checkout.session.completed` via `arrayUnion` + claims mirror — the
correct trust boundary.

**Tests.** `entitlements.spec.ts` is exhaustive for the pure helpers. **No tests
for `CheckoutService`, `EntitlementStore`, `entitlementGuard`, or either server
function — the webhook (security-critical) is untested.**

**Risk (load-bearing).**

1. **Webhook handles only `checkout.session.completed`.** No subscription
   lifecycle (`customer.subscription.deleted/updated`, `invoice.payment_failed`,
   refunds) — **subscription access is granted but never revoked**, yet
   `mode:'subscription'` is offered (`stripe/checkout.ts:27`).
2. Idempotency marker is written after processing without a transaction →
   concurrent duplicate deliveries can duplicate `purchaseHistory` entries.
3. Claims mirroring has no pruning → large entitlement arrays risk the
   1000-byte custom-claims limit over time.

**Mobile:** **3/5.** Stripe Checkout/Billing Portal are hosted and responsive;
redirect works on mobile web; no own UI to break. **Offline:** **1/5.** N/A by
nature; mild plus — `EntitlementStore.canAccess` resolves from cached ID-token
claims offline.

### 2.9 Storefront (SSR / SEO)

**Implemented.** Real SSR (full `outputMode: server`, `project.json:14-17`),
`provideClientHydration(withIncrementalHydration(), withEventReplay())`
(`app.config.ts:28`), Express engine + Vercel handler (`server.ts`). Pages
(landing, catalog, account, auth) are real, all standalone/OnPush/lazy. Per-route
`Title`/`description` set SSR-safe. Auth is SSR-guarded
(`AuthService` injected only when `isPlatformBrowser`).

**Tests.** 4 meaningful specs (`auth.component.spec.ts` is the strongest). No
SSR/hydration-specific test.

**Risk (load-bearing).**

1. **Empty Firebase config defeats SSR-for-SEO of dynamic content.** All Firestore
   reads run in `afterNextRender` (browser-only) because
   `environment.firebase.apiKey` is empty and a prerender read would throw
   `auth/invalid-api-key` (`catalog.component.ts:18-23,133-144`). So **catalog and
   account content is NOT in the server-rendered HTML** — non-JS crawlers see only
   "Loading courses…". Landing static copy + meta IS server-rendered.
2. **No social/SEO meta:** no Open Graph, Twitter Card, canonical, robots meta,
   `robots.txt`, or `sitemap.xml` (confirmed absent).

**Mobile:** **3/5.** Viewport present; catalog grid is fluid
(`repeat(auto-fill, minmax(16rem,1fr))`, `catalog.component.ts:77-81`); pages use
`max-width + margin:auto + padding`. But **zero `@media`/`clamp`** (fixed type,
e.g. hero `h1:2.5rem`) and a non-wrapping header (no hamburger) — "usable on
mobile" rather than mobile-first. **Offline:** **0/5.** **No PWA/service worker at
all** in storefront (the learner app has one; storefront does not). For a public
marketing surface this is low-value, but it is a total absence.

### 2.10 Admin & superadmin consoles

**Implemented.** Substantially feature-complete for desktop. **Admin:**
courses/course-editor, quizzes/quiz-editor, games/game-editor (4 engines with
save-time validation), members, branding, knowledge ingest, reports + CSV. Only
placeholder: the dashboard Leaderboards tile. **Superadmin:** tenants
(provision/suspend), library + library-editor (share-to-tenants via Cloud
Function), analytics (from `platformAnalytics`), catalog CRUD. Stubs: Feature
Flags, Billing.

**Tests.** 11 admin + 6 superadmin specs, mostly **shallow** (creation + DOM-text
smoke). No service-level or validation-depth tests.

**Risk.** **No unsaved-changes guard** on any editor (in-memory signals; nav loses
work). **No confirmation dialogs** on destructive/high-impact actions (member
deactivate, tenant suspend/resume — can lock out a whole tenant, catalog publish
toggle — flips live B2C visibility, remove question/card). Validation is mostly
save-time only (e.g. quiz editor doesn't enforce ≥1 correct answer per MCQ).

**Mobile:** **Admin 1/5, Superadmin 1/5** (offline N/A — authoring tools, which is
appropriate). Viewport present, but **zero `@media` queries**; every list/report
uses PrimeNG `<p-table>` with no responsive/stacking config and hard-coded wide
`min-width` (superadmin Tenants `50rem`, Catalog `60rem`) → horizontal overflow on
phones/tablets. Only the dashboard / analytics-totals `auto-fill` grids are
responsive. Usable on desktop/large landscape tablet; hostile on phones.

### 2.11 PWA / service worker (learner)

**Implemented.** `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() })`
(`apps/learner/.../app.config.ts:31-34`) — SW disabled in dev. `ngsw-config.json`
prefetches the app shell (html/css/js), lazily caches assets, and has a
`content-media` dataGroup caching mp4/webm/images/fonts (`performance`, maxSize 50,
7d). Viewport + theme-color present in `index.html`. Manifest is `display:standalone`
with 192/512 maskable icons.

**Risk (load-bearing).**

1. **No `dataGroups` for Firestore/API data** — courses, modules, member,
   enrollment, leaderboard, tutor reads have no caching → **every dynamic screen
   fails on a cold offline load.**
2. **Stale manifest:** `manifest.webmanifest` still reads `"Soteria FORGE"` /
   `"FORGE"` (product renamed to "Assurance").
3. **Referenced icons do not exist** — `apps/learner/public/` has only
   `icons-README.txt`, **no `icons/` directory**, so `icons/icon-192.png` and
   `icons/icon-512.png` are 404 → install/A2HS will have no icon.
4. **No `beforeinstallprompt` (A2HS) handling** anywhere — install relies solely
   on browser-native UI.

**Mobile:** **1.5/5.** **Offline:** **1.5/5.** Infrastructure floor is real
(shell + media cached, plus the xAPI queue), but from the learner's perspective
offline content silently fails and there's no offline indicator or install prompt.

### 2.12 Native mobile scaffolds (Android + iOS)

**Implemented.** Genuinely native, clean, idiomatic. **Android:** Kotlin + Compose

- Material3, Firebase BoM (auth + firestore), `data/model` → repositories →
  `*ViewModel` (StateFlow) → Compose screens. **iOS:** Swift + SwiftUI,
  firebase-ios-sdk via SPM, `@MainActor ObservableObject` VMs, XcodeGen (README notes
  it was authored on Linux and **never compiled** — first Xcode build is the
  verification step). Both implement GCIP multi-tenancy correctly (set tenant before
  sign-in, force-refresh token, read claims into a `Principal`); models mirror
  `libs/shared`.

**Reality vs brief.** Auth (tenant email/password) + course list are **fully
wired**. Course detail / modules are **NOT** wired — `CourseRepository.getCourse/
listModules` (Kotlin) and `CourseService.getCourse/listModules` (Swift) exist but
are **dead code** (never called); the course tap is a `TODO`
(`MainActivity.kt:53`, `CoursesView.swift:17`). **No players, quizzes, or games on
either platform.**

**Tests.** Effectively none (Android declares only the junit dep with no test
sources; iOS has no test target).

**Offline (the key asymmetry).** No explicit offline code, **but native Firestore
SDKs have on-disk persistence ON by default** and neither app overrides it — so
both get free read-offline caching of previously-fetched courses, and Auth
persists the session token. This is **the opposite of the web apps** (which have
no Firestore persistence). It is incidental, not engineered: `signIn`
force-refreshes (needs network), the course query is one-shot `.get()` (not a
snapshot listener), and there is no offline UX, write queue, or entitlement
gating.

**Maturity:** Foundation only — roughly **15–20%** of the web learner's surface
(auth + course list working; detail/modules stubbed; players/quizzes/games/
offline-xAPI/push all deferred per `mobile/README.md`). High code quality and a
faithful backend contract make it a solid base, but it is not yet a usable
learning client.

---

## 3. Cross-cutting observations

- **Documentation drift:** `docs/scorm-cmi5.md` and component READMEs document
  `forge-*` selectors, but the code uses `assurance-*` (the product was renamed).
  The `accessibility.md` "Reflow at 320px / 400% zoom" deployment checkbox is
  currently **unmet** on the learner (see §2.2, §2.11).
- **Offline is a data-layer problem first.** The single highest-leverage change is
  enabling Firestore `persistentLocalCache` in `provideForgeFirebase`
  (`libs/data-access/src/lib/firestore.providers.ts:28-34`) — one change benefits
  all four web apps. Today, confirmed by repo-wide search, **no** Firestore
  persistence API is used anywhere.
- **Server-authoritative integrity is mostly excellent** (grading, XP, payments
  webhook trust boundary), with two notable holes: **learner-writable enrollment
  completion/score fields** (`firestore.rules:75-76`) and **client-readable quiz
  answer keys** (`firestore.rules:82-85`).
- **Test posture:** unit/pure coverage is genuinely strong; **Cloud Functions are
  almost untested** (only `scorm/manifest-node.spec.ts` and `cmi5/token.spec.ts`),
  and nothing tests responsive/offline behavior.
