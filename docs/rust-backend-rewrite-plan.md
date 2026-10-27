# Soteria Forge — Plan: Rewrite the Backend in Rust

- **Status:** Draft v0.1 · 2026-10-27 · Jamil Jones
- **Changes (on acceptance):** the "Django 5 + DRF", "Celery" and "Django Channels" rows
  of [forge-platform-plan.md](./forge-platform-plan.md) §1; needs ADR 0002 and an update
  to SFG-SPC-FRG-010, which names Django on Railway
- **Does not change:** Angular apps, Firebase Auth / GCIP for identity, FCM, Postgres +
  pgvector with row-level security, Redis, LiveKit, Railway, the public API contract

The frontend stays Angular. A Rust/WebAssembly UI would still need the Firebase JS SDK
for sign-in and LiveKit's JS client for media, and would mean rebuilding the four apps,
the design system, the offline/PWA support, the accessibility checks and the mobile
shells. If a game or simulation outgrows TypeScript, a Rust WebAssembly module
called from Angular covers that case.

## 1. Summary

Replace the Django API in `backend/` with a Rust service (Axum + sqlx on Tokio) that
serves **the same HTTP contract on the same Postgres schema**. The Angular apps are
unaffected, and Django stays deployable as a rollback until the Rust service has run
in staging and production without issues.

**If this happens, now is the cheapest time.** The Django backend is about 1,200 lines
across four apps (`tenants`, `accounts`, `audit`, `engage`), 46 tests and 7 endpoints.
Phases 2–7 of the platform plan (learning, gamification, coach, Engage realtime,
standards, commerce) aren't built yet. Each phase built in Django first raises the
cost of switching later.

**Honest cost.** Allow **5–7 weeks** to reach parity for one developer who already writes
production Rust, and add 3–6 weeks if the developer is learning Rust. The Lakewood cohort
date moves by about that much. Later phases also take longer in Rust than in Django
(no admin, no DRF serializers or permissions, thinner SCORM/xAPI/Stripe libraries).
Rust doesn't make the API faster in any way users will notice, because the workload
waits on Postgres and the network and the only heavy work (media) already runs in
LiveKit. Section 10 lists the conditions under which this plan is worth executing.

## 2. Scope: what exists today

| Surface                                  | Django today                                                                                   | Rust replacement                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /healthz`                           | `accounts.views.healthz` (`SELECT 1`)                                                          | Axum handler, no auth                                                                    |
| `GET /api/me`                            | `MeView` → `{member, tenant, canAuthor}`                                                       | Same JSON shape                                                                          |
| `GET /api/members`                       | Tenant staff only                                                                              | Same                                                                                     |
| `PATCH /api/members/{id}/role`           | Tenant admin; row lock; audit; Firebase claim mirror **inside** the transaction                | Same transaction order, so a failed claim update still rolls back the role change        |
| `GET/POST /api/engage/classrooms`        | List: any active member; create: staff, audited                                                | Same                                                                                     |
| `POST /api/engage/classrooms/{id}/join`  | Provisions the LiveKit room, returns a 5-minute scoped token, `Cache-Control: no-store`        | `livekit-api` crate (official Rust server SDK)                                           |
| `GET /api/schema`                        | drf-spectacular                                                                                | `utoipa` OpenAPI, validated in CI                                                        |
| `/admin/`                                | Django admin for tenants, members, audit                                                       | **Dropped.** Superadmin app + CLI subcommands (§4.6)                                     |
| `manage.py migrate`                      | Django migrations, incl. RLS policies and the audit trigger                                     | `sqlx` SQL migrations (§4.3)                                                             |
| `manage.py ensure_app_role`              | Creates/refreshes `forge_app` (no superuser, no BYPASSRLS, append-only audit)                  | `forge ensure-app-role` subcommand, same SQL                                             |
| `manage.py grant_superadmin`             | Out-of-band superadmin grant                                                                   | `forge grant-superadmin` subcommand                                                      |
| Firebase Admin (Python)                  | Verify ID tokens incl. revocation; set custom claims per GCIP tenant                           | **No official Rust SDK.** Hand-written `forge-firebase` crate (§4.2), the highest-risk part |
| CORS, security headers, allowed hosts    | django-cors-headers, `SECURE_*`, `ALLOWED_HOSTS` incl. `healthcheck.railway.app`               | `tower-http` CORS with the same origin regex and `x-forge-tenant`; host allowlist and header middleware |
| Sentry (no PII)                          | `sentry-sdk[django]`, `send_default_pii=False`                                                 | `sentry` + `sentry-tower`, PII off                                                       |

Frontend callers to keep working unchanged: `libs/auth/src/lib/forge-api.ts`,
`libs/auth/src/lib/guards.ts`, `apps/learner/src/app/pages/engage/engage.service.ts`.

## 3. Target layout

```
backend-rs/                    NEW during migration; becomes backend/ at cutover (§6)
  Cargo.toml                   workspace
  crates/
    forge-api/                 binary: `forge serve | migrate | ensure-app-role | grant-superadmin`
      src/routes/{health,me,members,engage}.rs
      src/auth.rs              Bearer extractor → (Member, Option<Tenant>)
      src/error.rs             DRF-compatible error bodies (§4.5)
    forge-core/                pure domain: Role, MemberStatus, TenantStatus, permission rules
    forge-db/                  sqlx queries, `TenantTx` (RLS), audit `record()`
    forge-firebase/            ID-token verification, revocation, custom claims
    forge-media/               LiveKit room provisioning + scoped tokens
  migrations/                  sqlx SQL migrations
  tests/                       in-process integration tests (one per Django test, same names)
  Dockerfile                   cargo-chef build stage → small non-root runtime image
```

Later phases add `forge-worker` (jobs) and realtime routes to `forge-api` (§7).

## 4. Design decisions

### 4.1 Row-level security: transaction-local tenant settings

Django sets `app.tenant_id` / `app.rls_bypass` at **session** level and restores them after
each request (`apps/tenants/rls.py`). In Rust, every request that touches tenant data
runs in one transaction, through a `TenantTx` extractor:

```sql
BEGIN;
SELECT set_config('app.tenant_id', $1, true);   -- true = transaction-local
SELECT set_config('app.rls_bypass', 'off', true);
... handler queries ...
COMMIT;  -- or ROLLBACK on error; settings vanish either way
```

A pooled connection can't carry one request's tenant into the next request, even if a
handler panics, so the "restore previous values" logic goes away. Platform-level lookups
(sign-in membership resolution, superadmin platform requests) use an explicit
`with_bypass` call that is easy to find in review. The Postgres policies
(`tenant_isolation`) and the `forge_app` role stay the same.

One rule follows from this: **don't call slow external services while holding the
transaction** unless the call has to be atomic with the write. Engage join reads the
classroom, commits, then calls LiveKit. Role change keeps the Firebase call inside the
transaction on purpose (the existing `test_failed_claim_sync_rolls_back_the_role`).

### 4.2 Firebase without Firebase Admin

`forge-firebase` re-implements the three things Django uses from `firebase-admin`:

1. **Verify ID tokens.** RS256 only. Look up `kid` in Google's securetoken public
   keys (cached per `Cache-Control`). Check `iss = https://securetoken.google.com/<project>`,
   `aud = <project>`, `exp` and `iat` (small clock skew), non-empty `sub` ≤ 128 chars and
   `auth_time` ≤ now. Read `firebase.tenant`.
2. **Check revocation** (Django uses `check_revoked=True`). Call Identity Toolkit
   `accounts:lookup`, scoped to the token's GCIP tenant. Reject a disabled user or
   `iat < validSince`. Cache briefly per uid, and don't cache rejections.
3. **Set custom claims.** Read-merge-write through `accounts:update` with
   `customAttributes`, scoped to the GCIP tenant. Keep the existing merge semantics
   (keep other claims, drop `tenantId` for superadmins).

Service-account OAuth tokens come from the `FIREBASE_CREDENTIALS_JSON` env var. The Auth
emulator (`FIREBASE_AUTH_EMULATOR_HOST`) issues unsigned tokens. The emulator path must
**refuse to start** unless debug mode is on, and a test must prove it. This crate gets
its own security review before cutover. It's the one place where a mistake means
anyone can sign in as anyone.

When the guards stop reading claims (platform plan §2: only `tenantId` stays a claim),
step 3 shrinks, so ship the guard change before or with this rewrite if possible.

### 4.3 Schema and migrations: keep the tables, change the tool

- The first sqlx migration is a **baseline**: the current schema as produced by Django
  migrations (`pg_dump --schema-only`, minus `django_*` and `auth_*` tables), including
  RLS policies, the audit append-only trigger, constraints
  (`member_unique_per_tenant`, `superadmin_unique_uid`, `member_role_matches_tenant_scope`)
  and indexes.
- **Table names stay Django's** (`tenants_tenant`, `accounts_member`, `audit_auditentry`,
  `engage_classroom`) until after cutover, so Django and Rust can run against the same
  database and rollback needs no data migration. Renaming them is a separate, later
  migration.
- There's no production cohort (platform plan §6). Staging is re-created from the
  baseline instead of reconciling the two migration histories.
- CI uses `sqlx` offline query checking (`cargo sqlx prepare --check`), which replaces
  `makemigrations --check`.

### 4.4 Web stack

Axum on Tokio, `sqlx` (Postgres, compile-checked queries), `serde`, `tower-http`
(CORS, tracing, timeouts, request IDs), `utoipa` (OpenAPI), `tracing` with JSON logs,
`clap` (CLI). Config comes from the same env var names where they still apply
(`DATABASE_URL`, `DB_APP_USER`, `DB_APP_PASSWORD`, `DB_USE_OWNER`, `FIREBASE_*`,
`LIVEKIT_*`, `FORGE_ROOT_DOMAIN`, `CORS_EXTRA_ORIGINS`, `SENTRY_*`, `PORT`).
`DJANGO_DEBUG` / `DJANGO_ALLOWED_HOSTS` become `FORGE_DEBUG` / `FORGE_ALLOWED_HOSTS`,
and `DJANGO_SECRET_KEY` goes away because the API uses no sessions or CSRF.

### 4.5 Keep the API contract byte-compatible where clients can see it

- JSON field names and shapes from the DRF serializers (`uid`, `tenantId`,
  `displayName`, `canAuthor`, `createdBy`, `createdAt`, `maxParticipants`, `serverUrl`,
  `token`, `canScreenShare`). Timestamps in DRF's ISO-8601 format.
- Errors: `{"detail": "..."}` with the same messages. 401 + `WWW-Authenticate: Bearer`
  when no or invalid credentials are sent, and 403 for permission failures. A malformed UUID
  in the path returns 404, as Django's `<uuid:>` converter does. Validation errors use
  DRF's `{"field": ["message"]}` shape.
- 503 with the same message when LiveKit is unconfigured or unreachable, and the same
  production checks (`wss` only, no `devkey`, secret ≥ 32 bytes).
- A CI contract test compares the Rust OpenAPI document against the Django one (while
  both exist) and the zod schemas in `libs/shared`.

### 4.6 Losing the Django admin

The admin is currently the only UI for tenants, members and the audit log. Replace it with:

- CLI subcommands for break-glass work (`grant-superadmin`, `ensure-app-role`, later
  `provision-tenant`).
- Superadmin app screens backed by API endpoints. These were already planned as the
  `provisionTenant` / `setTenantStatus` / `updateBranding` ports. Pull them forward to
  the parity phase if staff rely on the admin day to day.
- A read-only audit log endpoint for superadmins.

## 5. Phases

| #   | Phase                                | Delivers                                                                                                                                                                                                                       | Exit gate                                                                                                    |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| R0  | **Decide + spike** (≈1 wk)           | ADR 0002. Spike in `backend-rs/`: Firebase token verification + revocation against the Auth emulator, `TenantTx` against the RLS policies as `forge_app`. Confirm who maintains Rust long term                               | Go/no-go recorded in the ADR                                                                                 |
| R1  | **Parity harness** (≈1 wk)           | Make `backend/scripts/e2e_emulator.sh` implementation-neutral (seed with `psql`, not `manage.py shell`). List the 46 pytest cases as the acceptance list. Add a stub-server option for the Firebase and LiveKit fault-injection cases | Harness green against **Django**                                                                             |
| R2  | **Foundation** (≈2–3 wk)             | Workspace, config, `/healthz`, CORS + security headers + host allowlist, `forge_app` pool, baseline migration, CLI subcommands, `forge-firebase`, auth extractor, permissions, `/api/me`, members, role change + claim mirror, audit, OpenAPI, Sentry, Dockerfile, CI (`fmt`, `clippy -D warnings`, tests, `sqlx prepare --check`, `cargo deny`) | Rust ports of `test_auth`, `test_members`, `test_rls`, `test_cors` pass; harness green against **Rust**       |
| R3  | **Engage** (≈1 wk)                   | `forge-media`, classroom list/create/join                                                                                                                                                                                      | Rust port of `test_engage` passes; `LIVEKIT_SMOKE=1` Playwright run passes against Rust                      |
| R4  | **Cutover** (≈1 wk)                  | `api-rs` Railway service in staging on the same database; Firebase crate security review; switch `api.soteriaforge.com`; Django image kept deployable for 2 weeks                                                             | Learner + admin apps work against Rust in staging and production; no Sentry regressions; then delete Django |
| R5+ | **Platform plan phases 2–7 in Rust** | As in the platform plan §5, with the replacements in §7                                                                                                                                                                         | Platform plan exit gates, unchanged                                                                          |

Sizes assume one developer fluent in Rust. Each Django test is ported **by name** so
the mapping can be checked in review.

## 6. Cutover and rollback

1. Staging: add an `api-rs` service in `.railway/railway.ts` (`rootDirectory: 'backend-rs'`,
   pre-deploy `forge migrate && forge ensure-app-role`, health check `/healthz`) next to
   the Django `api`, both on the same Postgres.
2. Point staging Angular builds at `api-rs`, then run the harness, the emulator e2e
   script, the Playwright engage media spec and a manual sign-in on learner + admin.
3. Production: swap the domain to `api-rs`. **Rollback = swap the domain back**,
   because the schema and the RLS role are shared.
4. After two quiet weeks: delete Django (`backend/` Python code, `uv.lock`, the Django CI job),
   move `backend-rs/` to `backend/`, update `docs/deployment.md`, the platform plan and
   `docs/video-classrooms.md`, and drop the Django-only tables.

## 7. Replacements for the later phases

| Planned in Django                         | Rust replacement                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Celery worker                             | `forge worker` subcommand; Postgres job table polled with `FOR UPDATE SKIP LOCKED` (jobs commit with the data that triggers them) |
| Celery beat                               | Railway cron service running `forge run-job <name>`, or a scheduler inside the worker                               |
| Channels (Engage live state, leaderboard) | Axum WebSockets + Redis pub/sub between instances; short-lived ticket from `POST /api/ws-ticket` as planned          |
| SSE (coach answers)                       | `axum::response::Sse`                                                                                                 |
| pgvector                                  | `pgvector` crate with sqlx                                                                                            |
| S3 signed URLs                            | `aws-sdk-s3` presigning (works with R2 and Railway buckets)                                                           |
| Stripe                                    | Community SDK or plain HTTP; webhook signature check + idempotency table, written and tested by us                   |
| FCM                                       | HTTP v1 API with the service-account token from `forge-firebase`                                                    |
| SCORM / cmi5 parsing                      | `zip` + `quick-xml`; the existing function specs are the acceptance tests                                             |
| xAPI to LRS                               | `serde` statement types + `reqwest`                                                                                   |
| GCIP tenant provisioning                  | Identity Toolkit REST in `forge-firebase`                                                                             |
| LLM provider                              | Provider trait over `reqwest`, same swappable design as planned                                                       |

## 8. Gamification and media in Rust

Both are a good fit on the server side. The browser side (award overlay animations,
Phaser games, leaderboard screens, camera and microphone UI) stays in Angular/TypeScript
whatever the backend language.

### 8.1 Gamification (platform plan Phase 3)

| Feature                                        | Rust approach                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XP events, level bands, mission badges         | `forge-core` domain types that make invalid states unrepresentable (XP never negative, first-try attempts only); awards written in the same `TenantTx` as their audit entry         |
| Anti-cheat and server-authoritative completion | Port the existing function specs (commits `321ad2c`, `ab60149`) as tests first, as the platform plan requires                                                                      |
| Pulse streaks + 14-day strip                   | Postgres queries over dated activity rows; reminders as a scheduled job (§7)                                                                                                        |
| Crew-only leaderboards                         | Postgres aggregates, or Redis sorted sets when scores update live; daily/weekly resets as scheduled jobs; no learner ranked by name                                                |
| Live crew scores, polls, Threat Hunt countdowns | Axum WebSockets + Redis pub/sub (§7), server-stamped times. Holding many idle connections cheaply is where Rust helps most                                                          |
| Offline replay without double awards           | `Idempotency-Key` table checked inside the award transaction                                                                                                                       |
| Open Badges 3.0 issuance + verify page         | Badges are W3C Verifiable Credentials: sign with `ed25519-dalek` / `josekit`, or SpruceID's `ssi`. Test issued badges against a public Open Badges 3.0 verifier before launch       |
| Badge images                                   | `resvg` (SVG) and `image` (raster), generated in a worker job and stored in the bucket                                                                                              |

### 8.2 Media (platform plan Phase 5)

| Feature                                    | Rust approach                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video classrooms                           | Unchanged: LiveKit (Go) relays media; `forge-media` provisions rooms and signs scoped tokens with the official `livekit-api` crate (R3)                                      |
| Host moderation (mute, remove)             | LiveKit room service API from `forge-media`, checked against Forge roles and audited                                                                                         |
| Recording                                  | LiveKit Egress (separate service) started and stopped from `forge-media`; output goes to the bucket                                                                          |
| Attendance                                 | LiveKit webhooks (signature-verified) written to Postgres; not inferred from connection logs (see [video classrooms](./video-classrooms.md))                                 |
| Uploads (SCORM, PDFs, badge images)        | Presigned S3/R2 URLs (§7); processing in the worker                                                                                                                          |
| Video/audio processing, if needed          | Run `ffmpeg` from a worker job                                                                                                                                               |
| **Live captions, transcription, AI voice** | **Gap.** LiveKit's Agents framework is Python or Node.js only. Either run a small Python agent service next to the Rust API, or stream room audio to a speech-to-text API from a Rust worker that joins the room with the LiveKit Rust client SDK |

Captions are in Phase 5 scope, so decide between those two options before Phase 5
starts (§11).

## 9. Risks

| Risk                                                         | Mitigation                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Hand-written Firebase verification has a security bug        | Small dedicated crate, negative tests for every claim check, emulator-only path fails closed, external review before cutover |
| Regressions in tenant isolation                              | `TenantTx` is the only way handlers get a DB handle; RLS tests run as `forge_app`; harness checks cross-tenant cases |
| Slower feature delivery after the rewrite                    | Measure R2 against its estimate; if it overruns by more than 50%, stop and keep Django (only `backend-rs/` is lost) |
| Only one person can maintain the backend                     | Decide ownership in R0; document crates; keep the code idiomatic and boring (no macros-heavy frameworks)      |
| Contract drift breaks the Angular apps                       | OpenAPI diff + zod contract test in CI; frontend specs unchanged                                               |
| Long Rust builds on Railway                                  | `cargo-chef` dependency layer caching; release profile tuned for build time in staging                         |
| Docs and specs still say Django                              | ADR 0002 and SFG-SPC-FRG-010 update in R0, before any code merges                                             |
| Live captions need Python (LiveKit Agents)                   | Decide before Phase 5 (§8.2): a small Python agent service, or a Rust worker streaming audio to a speech-to-text API |
| Open Badges 3.0 credentials don't verify elsewhere           | Test issued badges against a public Open Badges 3.0 verifier in CI before the verify page ships                |

## 10. When this is worth doing

Do it if **at least one** of these is true; otherwise keep Django and revisit after the
Phase 5 load test:

- The team that maintains the backend long term is stronger in Rust than in Python.
- A customer or compliance requirement favors a memory-safe, single-binary service
  with a minimal runtime image.
- Measured hosting cost or latency at expected scale is a problem that Django
  tuning doesn't fix.

A narrower alternative that keeps most of the benefit: keep Django and write only a
specific hot path in Rust (for example an Engage WebSocket fan-out service) when load tests
show the need.

## 11. Open questions

- [ ] Who owns the Rust backend long term, and do they already write production Rust?
- [ ] Is the Lakewood cohort date flexible by 5–7 weeks (or more)?
- [ ] Do staff use the Django admin today? (Decides whether superadmin screens move into R2.)
- [ ] Ship the "guards read `/api/me`, not claims" change before R2 so the claim-mirror code shrinks?
- [ ] Live captions: a Python LiveKit Agents service, or a Rust worker plus a speech-to-text API? (Which provider fits FERPA?)
