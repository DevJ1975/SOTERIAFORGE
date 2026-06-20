# Competitor Benchmarking — Mobile-First & Offline Learning

Benchmarks how leading LMS / mobile-learning products handle **mobile-first UX**
and **offline learning**, then maps the gaps Soteria Assurance has versus the
market. Focus is deliberately narrow: download-for-offline, offline assessment +
sync, background sync of results/xAPI, native-vs-PWA strategy, push/reminders,
and microlearning patterns.

> **Research method & caveat.** Findings come from official help centers / product
> pages and reputable secondary sources, gathered via web search. Several vendor
> help centers (Docebo, Cornerstone, Moodle dev/docs, Instructure, Articulate,
> SafetyCulture) returned HTTP 403 to direct fetch, so some claims rely on
> search-surfaced extracts of those same official pages. Items that could not be
> independently verified are flagged **[unverified]**. Sources are listed at the
> end.

---

## 1. Comparison matrix

Legend: ✅ yes · ⚠️ partial / conditional · ❌ no · — not found / N/A.

| Product                          | App strategy                                                                                             | Offline content download                                                                                                                  | Offline quiz/assessment                                                                                               | Background sync of results                                                               | Push / reminders                                                                                        | Microlearning / spaced repetition                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Docebo (Go.Learn)**            | Native iOS/Android + white-label "Branded App Publisher"                                                 | ✅ SCORM, video, slides, files, HTML, full courses (not learning plans); compressed download. YouTube/Vimeo/Wistia ❌                     | ⚠️ via offline SCORM tracking; no separate offline-quiz feature **[unverified]**                                      | ✅ auto on reconnect; "most recent tracking wins" conflict rule                          | ✅ (online/logged-in only; missed pushes not re-delivered)                                              | ⚠️ card-based microlearning; bg audio/video playback                                                |
| **Cornerstone (Galaxy / Learn)** | Native unified iOS/Android (brandable, WCAG AA, dark mode)                                               | ⚠️ SCORM online courses + video (.mp4/.m4v inline); YouTube ❌                                                                            | ⚠️ offline SCORM completion (Rustici offline player); no distinct offline-quiz **[unverified]**                       | ⚠️ requires reconnect + re-login, then "Mark Complete" (not fully background)            | ✅ iOS opt-in; Notification Center; disabled on shared devices                                          | ✅ real-time microlearning feed (ex-EdCast)                                                         |
| **Moodle App**                   | Hybrid (Ionic + Cordova) in a native shell; open source                                                  | ✅ whole courses / sections / items via "cloud" download icon (MP4 for video)                                                             | ✅ **explicit offline quizzes** (teacher-enabled; deferred-feedback only; no timers/password/subnet)                  | ✅ on reconnect; **app must be running/backgrounded** (closed app won't sync)            | ✅ AirNotifier backend (self-hostable; encrypted in 4.1.4+/App 4.2+)                                    | ⚠️ "nano-courses"; responsive HTML; no built-in SRS                                                 |
| **Canvas Student**               | Native (Swift / Kotlin), open source                                                                     | ✅ pages, modules, files, assignment details, announcements, discussions, grades — **view-only**                                          | ❌ "Quizzes will not be available in offline mode"                                                                    | ⚠️ view-only; auto/manual sync, WiFi-only option; no offline submission                  | ✅ push for announcements/assignments/etc. (immediate-only)                                             | ❌ mirrors course structure; no micro feed                                                          |
| **TalentLMS**                    | Native iOS/Android + responsive web; custom Android "Content Downloader" (priority queue, demand-driven) | ✅ uploaded video/audio/PDF, SCORM/HTML; per-unit, "offline-compatible" bar (YouTube/Vimeo ❌). SCORM-offline **[unverified]**            | ✅ assessments offline-compatible (retries/time limits/shuffle); randomized tests may need online start **[partial]** | ✅ units sync on reconnect; cross-device resume (background-vs-on-open **[unverified]**) | ✅ deadline/assignment push (event-driven)                                                              | ✅ microlearning + "microcertifications" positioning; unit-based                                    |
| **SAP Litmos**                   | Native iOS/Android (native iOS player: PiP/captions/speed) + responsive web                              | ⚠️ **SCORM 1.2 only**, admin-flagged at upload, irreversible (SCORM 2004 not covered; no Flash/external)                                  | ⚠️ via SCORM packages only; native Assessment offline **[unverified]**                                                | ⚠️ **relaunch-triggered** — learner must reopen the module online to sync                | ✅ course/path invites, due-date + ILT reminders; also SMS                                              | ⚠️ microlearning via Litmos Heroes content; AI summaries                                            |
| **Absorb LMS**                   | Native "Absorb Learn" iOS/Android (+ legacy Offline Player) + responsive web; branded apps               | ✅ SCORM, xAPI, MP4, PDF/Office, Assessment lessons; 2 admin toggles ("Enable for Mobile App" + "Allow Course Content Download")          | ✅ Assessment lessons offline (MCQ/written/drag-drop); explicit offline-queue wording **[partial]**                   | ✅ auto on reconnect (true background-when-closed **[unverified]**)                      | ✅ per-message-template push toggle                                                                     | ⚠️ microlearning as content strategy                                                                |
| **360Learning**                  | Native iOS/Android + responsive web; **shared/kiosk device mode** (frontline)                            | ✅ images/uploaded video/office docs/questions/cheat sheets; **SCORM 1.2 + 2004** (xAPI/cmi5/AICC ❌); manual download only on new player | ✅ questions/assessments offline; instructors can grade from mobile                                                   | ⚠️ syncs on app-open while logged in, and **only for _finished_ offline courses**        | ✅ push (path/session); 30-day window on mobile                                                         | ✅ collaborative microlearning; gamification on mobile                                              |
| **Articulate Rise 360**          | **No learner app** — responsive web; delivered via LMS or Reach 360                                      | ❌ no native offline-with-sync; offline = export to SCORM/PDF/Web zip handled by host LMS                                                 | ❌ delegated to host LMS                                                                                              | ❌ delegated to host LMS                                                                 | — (delivery via LMS)                                                                                    | ✅ block-based lessons; **stepped one-block-per-screen** nav                                        |
| **EdApp / SC Training**          | **Native-first** "Mobile LMS" iOS/Android                                                                | ✅ explicit **Offline Mode** — "download on WiFi → complete on the go"; some lessons need connectivity (flagged)                          | ✅ complete lessons offline                                                                                           | ✅ **"progress automatically syncs once back online"**                                   | ✅ push (implied) **[unverified specifics]**                                                            | ✅ **5-min lessons + SM-2 spaced repetition ("Brain Boost")** + leaderboards + redeemable stars     |
| **Duolingo** (gold standard)     | **Native only** (offline not on web)                                                                     | ⚠️ Super-gated, time-boxed, current-level only (full download **removed in 2021**)                                                        | ⚠️ cached lessons playable offline                                                                                    | ✅ XP/lessons sync on reconnect; **streaks/leaderboards NOT back-dated**                 | ✅✅ behavior-triggered, **≤2/day cap**, habit-window timing (~23.5h), 7-day decay, bandit-personalized | ✅✅ daily micro-lessons; trainable spaced repetition (Half-Life Regression); hearts/XP/streak loop |

---

## 2. What the market does well (patterns to emulate)

**Offline (best blueprint = EdApp / SC Training, then Moodle):**

- **Explicit "download on WiFi → learn offline → auto-sync on reconnect."** This
  is the dominant, learner-trusted model (EdApp, Docebo, Absorb, Moodle). The
  honest twist worth copying: **per-lesson offline indicators** that flag content
  which _requires_ connectivity (EdApp, Docebo's SCORM-with-embedded-video rule).
- **Offline assessments with deferred sync** are rarer and a real differentiator.
  **Moodle** is the clearest model: offline quizzes are opt-in per activity,
  restricted to deferred-feedback behavior (no timers/passwords), download the
  questions but **not** the answer keys, and submit on reconnect. Docebo/Cornerstone
  achieve offline assessment only _inside_ SCORM packages.
- **Background sync semantics matter.** Vendors differ: Docebo auto-syncs with a
  "most-recent-wins" conflict rule; Moodle needs the app running/backgrounded;
  Cornerstone requires reconnect + re-login + an explicit "Mark Complete." Pick an
  explicit conflict policy and a clear "synced/queued" UI — don't leave it implicit.
- **Download breadth**: Docebo (SCORM/video/slides/files/HTML/full course) and
  Moodle (whole course/section/item) set the bar; Canvas is broad but **view-only**.
- **Two cross-vendor realities to design around (important for scoping):**
  1. **"Background sync" is really "sync on reconnect / relaunch" everywhere.** No
     vendor documents a true OS-level background daemon. Litmos is explicitly
     relaunch-triggered; 360Learning syncs only on app-open while logged in **and
     only for _finished_ offline courses**; Moodle needs the app running/
     backgrounded; Docebo/Absorb say "automatic on reconnect" without confirming a
     closed-app process. → A web PWA using the **Background Sync API** + a
     flush-on-`online`/on-launch outbox is genuinely competitive, not behind.
  2. **Offline is opt-in per course, gated by admin toggles** (TalentLMS unit
     compatibility; Litmos per-module flag; Absorb's two toggles; 360Learning
     "Play offline" + SCORM "Mobile sharing"). → Model an explicit
     `availableOffline` / `allowDownload` flag on courses rather than making
     everything downloadable.
- **Standards-offline coverage is uneven and a differentiation opening:** most
  vendors cap offline at SCORM 1.2 (Litmos) or exclude xAPI/cmi5 entirely
  (360Learning). Soteria Assurance already has a tenant-stamped xAPI pipeline +
  offline queue, so **offline xAPI/cmi5 is a credible differentiator** if the
  player persists runtime state locally.

**Mobile-first UX:**

- **Native apps are the norm** for serious mobile LMS (Docebo, Cornerstone, Canvas,
  TalentLMS, Litmos, Absorb, EdApp). Moodle is a hybrid (Ionic/Cordova) but still
  ships as an app. **Articulate Rise is the exception** — responsive web, author
  once, deliver via LMS — and it pays for that with no native offline story.
- **Stepped, one-thing-per-screen navigation** (Rise's Stepped mode) is a strong
  mobile pattern: a single content block per screen, big "next" target.
- **Microlearning norm ≈ 5-minute lessons** (EdApp explicit) plus **spaced
  repetition** (EdApp SM-2 "Brain Boost"; Duolingo's HLR) — both a content model
  and a review scheduler, not just short pages.

**Engagement (gold standard = Duolingo):**

- **Behavior-triggered, capped, habit-timed push** — not fixed-schedule spam:
  ≤2/day, fired ~23.5h after last activity in the user's revealed habit window,
  with a 7-day decay, chosen by a bandit algorithm. This is the reminder model an
  LMS should aim for.
- **Streaks + XP + daily-goal gauge + a forgiving mistake model** (hearts), and
  **"play first, profile second"** onboarding.
- **Honest sync rules**: Duolingo syncs XP/completions but explicitly does **not**
  back-date streaks/leaderboards offline — a clean way to avoid gamification
  exploits while still working offline.

---

## 3. Soteria Assurance gap analysis

Current state (from the readiness audit, `docs/audit/e2e-test-report.md`): the
learner is a **responsive-tolerant PWA** with a stale manifest, no offline data
caching, no offline UI, and one genuine offline mechanism (the xAPI localStorage
queue). Native apps are foundation-only. Mapped to the market:

| Capability the market has                         | Soteria Assurance today                                                                                                                          | Gap severity                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Download courses/SCORM/video for offline          | ❌ none (SW caches only previously-_viewed_ same-origin media; **YouTube/Vimeo — the default video path — uncacheable**)                         | **Critical**                               |
| Offline quiz-taking + later sync                  | ❌ none — quiz answers are volatile signals, submit hard-fails offline → **entire attempt lost**                                                 | **Critical**                               |
| Background sync of results/completion             | ⚠️ **xAPI only** (localStorage queue, flush on `online`). **Module completion / SCORM CMI / quiz results have no offline queue**                 | **High**                                   |
| Offline data reads (course list, modules)         | ❌ Firestore persistence **not enabled anywhere** → cold offline load fails on every dynamic screen                                              | **Critical** (single highest-leverage fix) |
| Offline status / "available offline" indicators   | ❌ no `navigator.onLine` use in any UI; data failures render misleading empty states                                                             | **High**                                   |
| Native mobile apps at parity                      | ⚠️ scaffolds only (auth + course list; no players/quizzes/offline) — though native Firestore gives them _incidental_ offline reads the web lacks | **High** (web), Medium (native)            |
| Add-to-Home-Screen / installable PWA              | ⚠️ manifest exists but is **stale ("FORGE")**, **icons are missing (404)**, and there is **no `beforeinstallprompt` handler**                    | **High**                                   |
| Mobile-first navigation (bottom nav / responsive) | ❌ header-only shell, no nav links at all; no breakpoints; `course-detail` fixed 2-col grid overflows phones                                     | **High**                                   |
| Push / reminders / streak nudges                  | ❌ FCM is in the stack but **no reminder/streak-nudge pipeline**; gamification streaks exist but aren't reinforced by push                       | **Medium**                                 |
| Microlearning + spaced repetition                 | ⚠️ module model exists; **no SRS / review scheduler, no "5-min lesson" framing, no stepped one-block-per-screen player**                         | **Medium**                                 |
| Per-lesson "requires connectivity" flagging       | ❌ none                                                                                                                                          | **Medium**                                 |

**Net:** Soteria Assurance is **behind the market on every offline dimension** and
on mobile-first navigation/installability, while being **competitive on standards
breadth** (SCORM 1.2/2004 + cmi5 + xAPI + Open Badges) and **ahead on AI tutoring**
(per-tenant RAG) — capabilities most competitors don't match. The strategic read:
the product's differentiators are real, but they're gated behind a learner
experience that doesn't yet work on a phone or a train. The fastest credible path
to parity is **EdApp's model** — explicit download-for-offline + auto-sync, 5-min
lessons, streak reminders — layered on the Firebase/Angular PWA, with the native
apps following to close the last mile.

---

## 4. Sources

**Docebo**

- https://help.docebo.com/hc/en-us/articles/360020080020-Working-with-content-on-your-Go-Learn-mobile-app
- https://help.docebo.com/hc/en-us/articles/360020124279-Go-Learn-App-Info-and-Limitations
- https://help.docebo.com/hc/en-us/articles/360020080040-Overview-of-the-Go-Learn-mobile-app
- https://help.docebo.com/hc/en-us/articles/360020126259-Configuring-notifications
- https://help.docebo.com/hc/en-us/articles/5511773580690-Features-for-the-branded-mobile-app
- https://www.docebo.com/products/mobile-app/

**Cornerstone**

- https://help.csod.com/help/csod_0/Content/Cornerstone_CSX_App/Cornerstone_Learn_-_Download_Learning.htm
- https://help.csod.com/help/csod_0/Content/Cornerstone_CSX_App/Cornerstone_CSX_App_-_Overview.htm
- https://help.csod.com/help/csod_0/Content/Cornerstone_Learn_Native_Mobile_App/iOS_Learn_App/iOS_Learn_App_-_Notif.htm
- https://rusticisoftware.com/products/rustici-engine/offline-scorm-player-extension/

**Moodle**

- https://docs.moodle.org/502/en/Moodle_app_offline_features
- https://docs.moodle.org/33/en/Moodle_Mobile_quiz_offline_attempts
- https://docs.moodle.org/311/en/Moodle_Mobile_quiz
- https://docs.moodle.org/dev/Moodle_Mobile_Push_Notifications
- https://moodledev.io/general/app/development/custom-push-notifications
- https://docs.moodle.org/dev/Moodle_Mobile_2_(Ionic_1)

**Canvas / Instructure**

- https://www.instructure.com/resources/blog/5-ways-canvas-mobile-apps-offline-feature-makes-learning-more-flexible-and
- https://www.instructure.com/press-release/instructure-launches-offline-feature-canvas-student-app-furthering-equitable-access
- https://community.instructure.com/en/kb/articles/662894-how-do-i-manage-my-canvas-notification-settings
- https://github.com/instructure/canvas-ios
- https://github.com/instructure/canvas-android

**Articulate Rise 360**

- https://www.articulate.com/360/rise/
- https://community.articulate.com/kb/user-guides/rise-360-export-to-lms-pdf-and-the-web/1081716
- https://www.commlabindia.com/articulate-rise-360

**EdApp / SC Training (SafetyCulture)**

- https://training.safetyculture.com/offline-mode/
- https://training.safetyculture.com/spaced-repetition/
- https://training.safetyculture.com/blog/spaced-repetition-a-learning-method-made-for-mobile/

**Duolingo**

- https://duolingo.deconstructoroffun.com/mechanics/notifications
- https://lingoly.io/duolingo-offline/
- https://duoplanet.com/how-to-use-duolingo-offline/
- https://research.duolingo.com/papers/settles.acl16.pdf
- https://raw.studio/blog/how-duolingo-utilises-gamification/

**TalentLMS**

- https://www.talentlms.com/mobile
- https://help.talentlms.com/hc/en-us/articles/360014572134-Which-content-types-are-supported-by-the-TalentLMS-mobile-app
- https://help.talentlms.com/hc/en-us/articles/360015305900-How-to-enable-the-unit-compatibility-mode-for-the-TalentLMS-app
- https://www.talentlms.com/blog/talentlms-mobile-app-design/
- https://www.talentlms.com/blog/talentlms-android-content-downloader-integration/

**SAP Litmos**

- https://support.litmos.com/hc/en-us/articles/360038994453-Offline-SCORM-Module-Viewing-on-Mobile-App
- https://www.litmos.com/features/mobile-app
- https://support.litmos.com/hc/en-us/articles/227738447-Customizable-Email-Templates-Mobile-Text-SMS-Notifications

**Absorb LMS**

- https://support.absorblms.com/hc/en-us/articles/360037480573-How-do-learners-download-and-sync-offline-progress-using-the-Absorb-Learning-Mobile-App
- https://support.absorblms.com/hc/en-us/articles/40331545826579-Mobile-App-Push-Notifications
- https://www.absorblms.com/blog/mobile-learning-apps-vs-responsive-design

**360Learning**

- https://support.360learning.com/hc/en-us/articles/115004610006-Download-courses-and-paths-on-the-mobile-app-to-play-them-offline
- https://support.360learning.com/hc/en-us/articles/4403309549204-Play-SCORM-and-eLearning-courses-on-the-mobile-app
- https://support.360learning.com/hc/en-us/articles/360046482652-Enable-shared-mode-on-the-mobile-app
- https://360learning.com/solution/mobile-learning/

**Explicitly unverified / could not confirm:** TalentLMS / SAP Litmos / Absorb /
360Learning specific offline-download and offline-quiz behaviors (vendor pages not
deeply retrievable); a dedicated offline-quiz feature in Docebo/Cornerstone
distinct from SCORM tracking; EdApp push specifics; Duolingo's exact current
bottom-tab inventory. Several official help centers returned HTTP 403 to direct
fetch; claims from those rely on search-surfaced extracts of the official pages.
