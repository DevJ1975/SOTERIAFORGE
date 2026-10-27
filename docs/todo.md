# To do

Last updated 2026-10-27. Context: Firebase is being replaced by Django, and courseware
is to be authored by Claude through MCP (see `docs/forge-mcp.md` on the `feat/forge-mcp`
branch / worktree).

## For you

- [ ] **Create a Railway Bucket** (S3-compatible) and add its variables to the API
      service: endpoint, bucket name, access key, secret key, region. Needed for
      uploaded media (video, audio, images). Claude can't create it.
- [ ] **Set `FORGE_API_BASE_URL`** on the Vercel `soteriaforge` project (the Django API's
      public URL, e.g. `https://api-staging-12cc.up.railway.app`). Without it the
      learner build fails by design. Firebase variables are no longer needed.
- [ ] **Set `AUTH_COOKIE_SAMESITE=None`** on the API if the frontend runs on a different
      site than the API (e.g. `*.vercel.app` previews). Keep the default `Lax` when both
      are under `*.soteriaforge.com`.
- [ ] **Configure email** for password-reset and invite links on the API: `EMAIL_BACKEND`
      (SMTP), `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
      `DEFAULT_FROM_EMAIL`. Until then emails only print to the server log.
- [ ] **Create the first real superadmin:**
      `manage.py grant_superadmin --email you@…` then `manage.py set_member_password --email you@…`.
- [ ] **Decide:** keep admin's manual lesson/quiz editors alongside Claude authoring, or
      retire them once MCP authoring is proven? (Default plan: keep them for now.)
- [x] **Decided:** B2C storefront is a public catalog with a request-access path; no B2C
      signup or Stripe checkout.
- [ ] **Decide:** Anthropic/AI tutor hosting. The Django coach runs on a local Ollama model
      only; production needs a hosted model or the tutor stays off.
- [ ] Review and push the branch: `feat/angular-22-upgrade` is ~11 commits ahead of
      `origin`. Two of them (gamification, My Progress) came from another session.
- [ ] Optional: delete the stale worktrees (`SOTERIAFORGE-mcp` after its MCP work is
      ported, and `.claude/worktrees/agent-*`).

## Queued for Claude

### 1. Forge MCP server (port from `feat/forge-mcp`)

- [ ] Port `backend/apps/mcp` (server, OAuth, tool framework) onto the current branch.
      It is uncommitted in the `SOTERIAFORGE-mcp` worktree and built on an older base.
- [ ] Replace its Firebase sign-in page (`apps/mcp/login.py`) with the Django sign-in
      (`apps/accounts/auth_views.py`). Keep the consent page showing account, role, tenant.
- [ ] Rewrite the course/module/lesson tools for the current `learning` models (key
      points and tags are JSON; lessons link to a quiz). Share validation with the REST
      serializers so there is one source of truth.
- [ ] Add deps (`mcp` SDK, `django-oauth-toolkit`), OAuth migration, `/mcp` ASGI route,
      env docs, and port the tests.

### 2. Claude-authored content

- [ ] **Quiz tools:** create/update a quiz and its questions, attach it to a lesson.
- [ ] **Games:** new `Game` model + REST API; MCP tools to create/update games; validate
      the four card-game configs (flip_reveal, match_pairs, sort_buckets, scenario_cards)
      with the same rules as `libs/games` `validateCardGameConfig`.
- [ ] **Lesson script/transcript field** and key points, for video lessons.
- [ ] Everything Claude creates lands as a **draft**. Publish, unpublish and delete stay
      with a person (same guardrail as the existing MCP rules).
- [ ] MCP server instructions/prompts so Claude follows good course design and treats
      course text as data, not instructions.

### 3. Media pipeline (needs the Railway Bucket)

- [ ] S3 storage via `boto3` against the Railway Bucket; presigned upload and read URLs.
- [ ] `forge_import_media(url)` tool: server-side fetch of a generated file (e.g. an
      ElevenLabs result URL) with a host allowlist, size limit and content-type check
      (SSRF-safe), stored in the bucket, returning an asset id to attach to a lesson.
- [ ] Attach audio/video/image assets to lessons; learner player reads them via signed URLs.

### 4. Finish removing Firebase

- [x] **Admin app:** courses and course editor (modules, lessons, uploads), games,
      quizzes, members and reports, branding moved from Firestore to the Django API.
- [x] **Superadmin app:** tenants, library and analytics on the Django API. The Stripe
      "catalog" page is dropped.
- [x] **Storefront:** now a public course catalog with a "request access" path (no
      checkout, no Stripe, no B2C signup).
- [x] Push notifications (FCM, streak-reminder job) dropped from web and mobile.
- [ ] Badges in Django (the learner home shows "0 of 8 earned" until they exist).
- [x] Deleted `apps/functions`, `libs/data-access`, `libs/payments`, Firestore/Storage
      rules, rules tests, `firebase.json`, `.firebaserc`, the emulator scripts and CI
      job, and the Firebase npm dependencies (`@angular/fire`, `firebase`,
      `firebase-admin`, `firebase-functions`, `firebase-tools`,
      `@firebase/rules-unit-testing`, plus the Genkit/Stripe/adm-zip/fast-xml-parser
      packages only the functions used).
- [x] Simplified `AssuranceEnvironment` (no `firebase` block, App Check or FCM keys);
      `FORGE_API_BASE_URL` is the only required frontend variable.
- [x] Native Android and iOS clients rewritten for the Forge API (not compiled: verify
      in Android Studio / Xcode).
- [ ] **Backend:** drop `FirebaseAuthentication` and `forge/firebase.py`, make
      `Member.firebase_uid` go away (migration), and remove the Firebase mentions in
      `backend/` (settings, `.env.example`, tests, `scripts/e2e_emulator.sh`).
- [ ] No Django xAPI ingest endpoint exists, so `OfflineXapiQueue` (kept for the
      learner offline banner) has no sender; add one or remove the queue.
- [ ] `DownloadService` (libs/player, unused by the apps) treats `asset:<id>` refs as
      not cacheable; teach it to resolve signed asset URLs before wiring it back in.

### 5. Housekeeping

- [ ] Run `grep` for stray `X 2.*` / `X 3.*` files now and then (iCloud conflict copies);
      the repo now lives in `SOTERIAFORGE.nosync`, which iCloud skips.
- [ ] Learner `app.component.a11y.spec` can time out when many projects run in parallel
      (passes alone); give it a longer timeout.
