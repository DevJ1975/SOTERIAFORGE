# Soteria Forge — Platform Plan: Angular 22 + Django on Railway

- **Status:** Draft v0.1 · 2026-10-26 · Jamil Jones
- **Implements:** SFG-SPC-FRG-011 (Learner Experience) on top of this repo
- **Supersedes (on acceptance):** ADR 0001 decisions 5–7 and the "Firebase/GCP hosts
  data and business logic" split in `docs/deployment.md`

## 1. Decision summary

| Layer               | Today                                  | Target                                                                     | Why                                                                                                                 |
| ------------------- | -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Frontend            | Angular ~20.0, Nx 20.4, AngularFire 19 | **Angular 22.2**, Nx 24, no AngularFire                                    | Newest Angular; AngularFire 21 only supports Angular ^21                                                            |
| Hosting (frontends) | Vercel                                 | Vercel (no change)                                                         | Already works; SSR storefront stays on the edge                                                                     |
| Identity            | Firebase Auth / GCIP multi-tenancy     | **Keep Firebase Auth / GCIP**                                              | Login, MFA, password reset and SAML/OIDC for Lakewood SSO already work; rebuilding them buys nothing                |
| Push                | FCM                                    | **Keep FCM** (sent from Django)                                            | Cheapest path to iOS/Android/web push                                                                               |
| Database            | Firestore                              | **Postgres on Railway** (+ pgvector)                                       | The spec's model is relational: cohorts → sections → crews, attempts, heat maps, crew totals, audit log, LMS export |
| Business logic      | 26 Cloud Functions (~2.6k LOC)         | **Django 5 + DRF** on Railway                                              | Spec SFG-SPC-FRG-010 names Django on Railway; server-authoritative logic is easier to test and audit in one place   |
| Background jobs     | Scheduled Functions, Storage triggers  | **Celery worker + Celery beat** (Redis)                                    | Leaderboard resets, streak reminders, SCORM parsing, embedding ingest                                               |
| Realtime (Engage)   | Firestore listeners                    | **Django Channels** (Redis)                                                | Live polls, block bar, Threat Hunt countdowns, crew scores, with server timestamps                                  |
| AI coach            | Genkit + Vertex, Firestore vectors     | **Python provider interface + pgvector**                                   | Same swappable-provider idea, one fewer runtime                                                                     |
| Files               | Cloud Storage + `storage.rules`        | **S3-compatible bucket** (Railway Bucket or Cloudflare R2) via signed URLs | Keeps education records with the database under one FERPA boundary                                                  |
| Removed             | —                                      | Firestore, Cloud Functions, Genkit, Storage rules, App Check, emulators    | —                                                                                                                   |

**Firebase verdict: keep it for identity and push only.** Those two pieces are
commodity, already integrated and expensive to rebuild. Everything that holds
education records or makes a grading, XP or badge decision moves to Django and
Postgres, so FERPA scope, audit logging and anti-cheat logic sit in one system.

### Where this plan departs from the spec

- **Angular, not HTMX.** SFG-SPC-FRG-010 says "Django/FastAPI + HTMX". This repo already
  has four Angular apps, a design system, offline support, accessible games and a
  passing test suite. Rewriting them in HTMX would throw that work away, and Engage and
  the animated coach diagrams need a rich client anyway. Django serves the API only.
- **Django only, no FastAPI.** DRF + Channels cover REST, SSE streaming and
  WebSockets, so a second Python framework isn't needed.

## 2. Target architecture

```
 Browser / PWA / native shells
   │  Firebase Auth SDK  ──────────────►  Firebase Auth / GCIP  (identity only)
   │  ID token (Bearer)
   ▼
 Vercel: learner · admin · superadmin · storefront (Angular 22)
   │ HTTPS + WSS                       api.soteriaforge.com
   ▼
 Railway project (envs: dev · staging · prod, PR environments)
   ├─ web     Django ASGI (gunicorn + uvicorn workers): DRF, SSE, Channels
   ├─ worker  Celery: SCORM parse, embeddings, xAPI forward, badge issuance, FCM sends
   ├─ beat    Celery beat: leaderboard resets, Pulse streak reminders, weekly coach review
   ├─ Postgres 16 + pgvector
   └─ Redis   (Channels layer, Celery broker, cache, rate limits)
   │
   ├─► S3-compatible bucket (SCORM/cmi5 packages, job aid PDFs, badge images)
   ├─► Zoom Video SDK (Django signs session JWTs; Zoom carries only A/V)
   ├─► LLM provider (open question in the spec)
   ├─► Stripe (B2C storefront; not needed for the Lakewood cohort)
   └─► LRS / Lakewood LMS (xAPI, SCORM/cmi5 export)
```

**Auth flow.** The Angular app signs in with the Firebase JS SDK, which handles the GCIP
tenant, MFA and SSO. Every API call sends the ID token. A DRF authentication class
verifies it with `firebase-admin` (Python), then maps `uid` + GCIP tenant to a Django
`Member`. **Roles live in Postgres**, not custom claims, so a role change takes effect
immediately and is audited. Only `tenantId` stays as a claim. WebSockets authenticate
with a short-lived ticket from `POST /api/ws-ticket`.

**Tenant isolation.** One shared schema. Every tenant-owned table has `tenant_id`, a
`TenantScopedManager` filters on it from request context, and Postgres row-level security
policies enforce it again (`SET app.tenant_id` per request/transaction). Isolation tests
replace `firestore.rules.spec.ts`.

## 3. Repo changes

```
backend/                       NEW: Django project (uv + pyproject), Nx targets via run-commands
  forge/settings/{base,dev,prod}.py
  apps/
    tenants/      Tenant, branding, lifecycle, provisioning
    accounts/     Member, roles, invites, Firebase token auth, FCM device tokens
    learning/     Course, Module, Lesson, KeyPoint, Enrollment, framework tags
    assessments/  Quiz, Item, Attempt (first-try, server timestamp)
    gamification/ XpEvent, Level bands, PulseStreak, Crew, CrewLeaderboard, MissionBadge
    credentials/  BadgeAward, instructor sign-off, Open Badges 3.0 issuer, verify page
    coach/        KnowledgeSource, Chunk (pgvector), CoachTurn, rating, review queue
    engage/       LiveSession, SessionBlock, Poll, PollAnswer, GameRound, Attendance
    standards/    xAPI LRS, cmi5 launch/fetch, SCORM manifest parsing, LMS export
    commerce/     Stripe checkout, portal, webhook (idempotent), entitlements
    compliance/   AuditLog, data export/delete, retention jobs
apps/functions/                DELETE at cutover
firebase.json                  REDUCE to auth config only (or delete; manage Auth in console/Terraform)
firestore.rules, firestore.indexes.json, storage.rules   DELETE
libs/data-access/              REWRITE internals: Firestore → HttpClient; keep public API
mobile/ios GoogleService-Info  KEEP (Auth + FCM)
```

### Porting the Cloud Functions

| Cloud Function                                                             | Django replacement                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `setMemberRole`                                                            | `PATCH /api/members/{id}/role` (admin only, audited)                                                                            |
| `provisionTenant`, `setTenantStatus`, `updateBranding`                     | `tenants` API; provisioning also creates the GCIP tenant via firebase-admin                                                     |
| `inviteMember`, `deactivateMember`                                         | `accounts` API; deactivate also disables the Firebase user                                                                      |
| `registerFcmToken`                                                         | `POST /api/devices`                                                                                                             |
| `submitQuiz`, `completeModule`, `assignCourse`                             | `assessments` / `learning` API; keep the anti-cheat and server-authoritative completion rules from commits `321ad2c`, `ab60149` |
| `onScormUpload`                                                            | Signed upload URL → `POST /api/packages/{id}/uploaded` → Celery parse                                                           |
| `platformAnalytics`                                                        | SQL aggregates / materialized views                                                                                             |
| `shareLibraryCourse`                                                       | `learning` API                                                                                                                  |
| `stripeWebhook`, `createCheckoutSession`, `createBillingPortalSession`     | `commerce` (port idempotency + cancellation revocation from `a39d1c8`)                                                          |
| `ingestStatement`, `xapi`, `launchCmi5`, `cmi5Fetch`                       | `standards` app                                                                                                                 |
| `askTutor`, `ingestKnowledge`                                              | `coach` app (SSE streaming answer) + Celery ingest                                                                              |
| `exportUserData`, `deleteUserData`                                         | `compliance` app                                                                                                                |
| `resetDailyLeaderboards`, `resetWeeklyLeaderboards`, `sendStreakReminders` | Celery beat                                                                                                                     |

The ~25 function specs (anti-cheat, privilege escalation, webhook idempotency, leaderboard,
completion) are the acceptance tests for the port. Rewrite each as a pytest case
before porting its function.

### Frontend data layer

`BaseRepository` keeps its method signatures (`getById`, `watch`, `list`, writes), so
components and services change very little. Inside it:

- `getById` / `list` / writes → `HttpClient` against DRF.
- `watch` → a shared WebSocket multiplexer (Channels) for the few live views (Engage,
  crew leaderboard). Everything else becomes fetch-on-navigate.
- Zod schemas in `libs/shared` remain the client-side contract. `drf-spectacular`
  publishes OpenAPI, and a CI contract test checks the zod schemas against it.
- `httpsCallable` call sites (about 12 files in `lms-core`, `tenant`, `payments`,
  `standards`, `ai-tutor`, `superadmin`) become typed `ApiClient` methods.
- Offline outbox (IndexedDB, MO-07/MO-09): it now replays to REST with an
  `Idempotency-Key` header. Django stores the keys so a replay can't double-award XP.

## 4. Angular 22 upgrade

Do this **first, before the backend swap**. It's a mechanical change with a clean diff,
and it removes AngularFire, which the new data layer no longer needs.

1. `nx migrate` in one hop per major: Nx 20 → 21 → 22 → 23 → 24, running migrations at
   each step. Angular follows (20 → 21 → 22). Commit after each hop with green CI.
2. **Replace `@angular/fire` with the `firebase` JS SDK** (v13) in `libs/auth`,
   `libs/auth-ui` and `apps/learner` push. This is required because AngularFire 21 only
   peers on Angular ^21. Firestore/Functions imports elsewhere are removed later
   in Phase 2, so in the interim keep them behind the SDK directly.
3. Bump companions to their Angular 22 lines: PrimeNG 22 (+ `@primeng/themes`), NgRx 22
   (store + signals), Transloco 8, ngx-quill 31, ag-grid-angular 36, ng-apexcharts 3,
   ngx-extended-pdf-viewer 31, `@angular/cdk` 22. Read the PrimeNG 19 → 22 theming
   changes before starting; the `@assurance/ui` wrapper should absorb most of them.
4. Take the defaults the new versions push: zoneless change detection (drop `zone.js`
   once tests pass), `@if`/`@for` control flow, signal inputs, the Vitest runner if Nx
   offers it. One app at a time, starting with `learner`.
5. Gate: all 92 spec files pass, axe a11y specs pass, Lighthouse PWA score unchanged,
   storefront SSR renders on Vercel preview.

### Phase 0 outcome (2026-10-26)

Done on `feat/angular-22-upgrade`: Nx 24.0 and Angular 22.2.3 (via Angular 21),
TypeScript 6, Jest 30; lint, all tests (including 61 Firestore-rules tests) and
all builds green. Auth runs on the plain `firebase/auth` SDK and is browser-only,
which fixed Angular 22's now-fatal SSR prerender error. WebMCP course tools ship
in admin (`docs/webmcp.md`).

Held back, each needing a decision or a later phase:

- **PrimeNG stays on 19 (MIT).** PrimeNG 22 moved to a commercial license with a
  license key (free only under $1M revenue, fewer than 5 developers and 10
  employees). It runs on Angular 22 today, outside its declared peer range.
  Options: buy PrimeNG licenses, or retire it in favor of the Forge design kit
  components (`materials/soteria-forge-design-kit`) on Angular CDK.
- **ApexCharts (`ng-apexcharts`) not upgraded and not imported anywhere.** Its
  license needs an OEM license for platforms used by others. Remove it, or use
  a permissively licensed chart library.
- **`@angular/fire` 19 + `firebase` 11 stay** until Phase 2 removes Firestore and
  Functions calls; AngularFire has no Angular 22 release.
- **`ngx-toastr`** has no Angular 22 release yet (not imported anywhere).
- **Zoneless change detection** deferred to the design-kit rollout, one app
  at a time, with browser testing.

### Phase 1 progress (2026-10-26)

Started in `backend/`: Django 6.1 + DRF on Python 3.13, Firebase ID-token auth
(tenant from the GCIP pool, or `X-Forge-Tenant` for shared-pool tenants;
membership rows decide access), tenants, members and roles in Postgres, the
`setMemberRole` port (`PATCH /api/members/{id}/role`, audited, mirrored to
claims inside the transaction), an append-only audit log enforced by a Postgres
trigger, `/api/me`, `/healthz`, OpenAPI at `/api/schema`, 23 pytest tests, a
Dockerfile and a CI job.

Railway is described in **`.railway/railway.ts` (Infrastructure as Code)**.
Railway deprecated `railway.toml`/`railway.json`: new services can't use them,
and existing ones stop on 2026-12-01. Not done yet in Phase 1: Postgres
row-level security, the Angular data layer calling the API, Sentry wiring
verified in a deployed environment, and creating the Railway project
(`railway config plan` / `apply` with the team's Railway account). Confirm that
Railway's managed Postgres offers `pgvector` before Phase 4.

CI now runs on Node 24: Angular 22 requires Node ^22.22.3 or ^24.15.

## 5. Phases

Dates depend on the Cohort 1 target, which the spec leaves open. Sizes assume one
full-stack developer plus part-time design. Each phase ends with a demo against the
walkthrough video.

| #   | Phase                                 | Delivers                                                                                                                                                                                                                                                                                                      | Exit gate                                                                                            |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0   | **Decide + upgrade** (≈1–2 wk)        | ADR 0002 (this plan), Angular 22 / Nx 24, AngularFire removed                                                                                                                                                                                                                                                 | CI green on Angular 22                                                                               |
| 1   | **Django foundation** (≈2 wk)         | Railway project + envs, Django skeleton, Firebase token auth, tenants, members, RBAC (learner, TA, instructor, Lakewood admin, SFG admin), audit log, RLS, CI (pytest, ruff, mypy), Sentry                                                                                                                    | Login in the learner app hits Django; isolation tests pass                                           |
| 2   | **Core learning on Postgres** (≈3 wk) | Courses → modules → lessons + key points + framework tags, enrollments, knowledge checks with first-try attempts, data-access rewrite, SCORM upload, offline replay                                                                                                                                           | **Home**, **Lesson + knowledge check** screens run on Django end to end; Firestore unused by learner |
| 3   | **Gamification to spec** (≈2–3 wk)    | XP events (never negative), level bands, Pulse streak + 14-day strip, cohorts/sections/**crews**, **crew-only leaderboard** (replaces today's individual leaderboard), private score card, mission badges, credentials with instructor sign-off, Open Badges 3.0 issuance + public verify page, award overlay | **My Progress** + award overlay match the video; no learner ranked by name                           |
| 4   | **Ask Forge coach** (≈3 wk)           | Corpus ingest to pgvector, retrieval scoped to module, SSE answers, **diagram spec** (linear flow, before/after, comparison, 2×2) rendered as animated SVG with text alternative, source chips, follow-ups, thumbs, weekly review queue, guardrails, pseudonymized logs                                       | Coach eval set ≥85% helpful in internal review; no-source answers say so                             |
| 5   | **Forge Engage** (≈4 wk)              | Zoom Video SDK session signing, video grid with crew-first paging, Channels session state, 30-min block bar, live poll with server timestamps, Threat Hunt, crew huddle notes, debrief heat map + "Reteach now", host view, attendance log, live captions                                                     | 20-learner load test with 3 sessions/week profile; keyboard-only run-through                         |
| 6   | **Standards + exports** (≈2 wk)       | xAPI statements to LRS, SCORM/cmi5 packages for Lakewood LMS, analytics for instructor/TA, at-risk list                                                                                                                                                                                                       | Lakewood LMS import verified                                                                         |
| 7   | **Cutover + hardening** (≈2 wk)       | Delete `apps/functions`, Firestore/Storage config and remaining Firebase deps (except Auth/FCM), WCAG 2.2 AA audit, pen test, backup/restore drill, runbooks                                                                                                                                                  | Pilot with internal cohort                                                                           |

The B2C storefront and Stripe port can slip behind Phase 6 because the Lakewood
cohort is B2B.

### Screen-to-phase map (SFG-SPC-FRG-011)

| Spec screen                                             | Exists today                                                         | Phase                        |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| Shell (88 px rail, top bar, cream canvas, brand tokens) | Partial: `@assurance/ui`, PrimeNG theme                              | 0–2 (retheme during upgrade) |
| Home                                                    | `dashboard.component` (generic)                                      | 2–3                          |
| Lesson + knowledge check                                | `course-detail` + player + quizzes                                   | 2                            |
| Ask Forge                                               | `tutor.component`, `libs/ai-tutor` (chat only, no diagrams)          | 4                            |
| Engage                                                  | Not built (games lib has accessible card games, Phaser host)         | 5                            |
| My Progress + award overlay                             | Leaderboard, XP badge, leveling, streaks libs (individual, no crews) | 3                            |

## 6. Data migration

There's no production cohort yet, so **plan for a clean start**. Content is
re-seeded from the curriculum (SFG-CNT-FRG-005) with a Django management command.
If any staging tenant data matters, run a one-off `manage.py import_firestore` that
reads a Firestore export and writes Postgres rows. Firebase Auth users stay where they
are, so nobody has to reset a password.

## 7. Security, privacy and operations

- **FERPA:** education records live only in Railway Postgres and the bucket. Firebase
  holds identity (email, name, MFA factors). Both vendors need to be in the Lakewood
  data-sharing agreement, and both need DPAs signed.
- **Encryption:** TLS everywhere. Confirm Railway's at-rest encryption for Postgres
  volumes and backups in writing. Field-level encryption for accommodations.
- **Audit log:** append-only table written in the same transaction as every grade,
  XP award, badge, credential and role change.
- **Backups:** Railway Postgres backups + nightly `pg_dump` to the bucket in a second
  provider; quarterly restore drill.
- **Observability:** Sentry (Django + Angular), structured logs, Railway metrics,
  uptime check on `/healthz`.
- **Rate limiting:** Redis-backed limits on coach and auth-adjacent endpoints (this
  replaces App Check).

## 8. Open questions added by this plan

- [ ] Accept Angular (not HTMX) as the frontend: update SFG-SPC-FRG-010
- [ ] Object storage: Railway Bucket vs Cloudflare R2
- [ ] Is Railway acceptable for the "GovCon / FedRAMP-adjacent" tenants named in ADR 0001?
      (If not, those tenants need a different deploy target; Django keeps that portable.)
- [ ] Keep GCIP per-tenant pools, or use one Firebase project with tenant in Postgres?
      (Per-tenant pools are recommended for Lakewood SSO.)
- [ ] LLM provider/hosting/cost (carried from the spec)
- [ ] PrimeNG 22 commercial license vs. replacing PrimeNG with the Forge design kit
- [ ] Remove `ng-apexcharts` (OEM license) or license it

## 9. Risks

| Risk                                               | Mitigation                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Port regresses anti-cheat / privilege fixes        | Port the existing function specs to pytest first; they gate each endpoint            |
| Engage realtime under live load                    | Phase 5 load test; Channels on Redis with sticky-free design; server-stamped answers |
| PrimeNG 19 → 22 breaking theme changes             | Absorb in `@assurance/ui`; upgrade one app at a time                                 |
| Two vendors for one login (Firebase + Django)      | Thin, tested auth class; Firebase used only for identity                             |
| Railway single-region outage during a live session | Engage degrades to Zoom-only; state resumes from Postgres                            |
