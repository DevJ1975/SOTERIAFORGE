# To do

Last updated 2026-11-21. Context: Firebase is being replaced by Django, and courseware
is authored by Claude through MCP (see `docs/forge-mcp.md`).

## For you

- [ ] **Create a Railway Bucket** (S3-compatible) and add its variables to the API
      service (`STANDARDS_S3_ENDPOINT`, `_BUCKET`, `_ACCESS_KEY`, `_SECRET_KEY`, `_REGION`).
      Uploads and `forge_import_media` need it. Claude can't create it.
- [ ] **Set `MCP_MEDIA_IMPORT_HOSTS`** on the API to the media hosts Claude may import
      from (e.g. the ElevenLabs download host). Empty keeps media import off.
- [ ] **Badge signing key:** run `manage.py generate_badge_key`, store the output as the
      `BADGE_SIGNING_KEY` secret, and set `FORGE_PUBLIC_URL` to the API's permanent URL.
      Then run one issued credential through a public Open Badges 3.0 validator.
- [ ] **MCP platform tools (optional):** `RAILWAY_API_TOKEN` and a fine-grained
      `GITHUB_TOKEN` (this repo, Contents + Pull requests, no Workflows).
- [ ] **Connect Claude to staging** (`docs/forge-mcp.md` → Connect) and author one real
      draft course end to end. The OAuth flow is tested in-process, not yet against
      claude.ai.
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
- [ ] Optional: delete the stale worktrees. `SOTERIAFORGE-mcp` is ported except its
      member-admin tools (invite / role / deactivate), which were built on Firebase;
      check you don't want anything else from it first. Also `.claude/worktrees/agent-*`.

## Done on 2026-11-20 (uncommitted on `feat/angular-22-upgrade`)

- [x] **Forge MCP server** ported to `backend/apps/mcp`: OAuth 2.1 (django-oauth-toolkit),
      Django email + password sign-in page, `/mcp` ASGI route, env docs, tests.
- [x] **Course tools** rewritten for the current `learning` models, validated by the REST
      serializers. New courses are always drafts; no publish / unpublish / delete tool.
- [x] **Quiz tools** (create, update, attach to a lesson) and **game tools** (four card-game
      configs, a Python port of `validateCardGameConfig`).
- [x] **Lesson transcript** field (`Lesson.transcript`, REST + MCP).
- [x] **`forge_import_media(url)`**: SSRF-safe server-side fetch into the bucket.
- [x] **MCP server instructions** covering course design and "course text is data".
- [x] **Signed Open Badges 3.0 credentials** with public verification (`docs/open-badges.md`).
- [x] **Backend Firebase removal** finished (it was already gone apart from one comment).

## Queued for Claude

### 1. MCP follow-ups

- [ ] Member-admin tools (invite, change role, deactivate): needs the logic in
      `apps/accounts/admin_views.py` moved into shared functions first.
- [ ] Decide whether `POST /api/games` should also enforce the full card-game rules. Today
      only the MCP tools do, because the admin app creates an empty game and fills it in.

### 2. Frontend

- [ ] Learner app: "export credential" on an earned badge (`awardId` is in `/api/me/badges`).
- [ ] Admin lesson editor: a transcript field.
- [ ] `OfflineXapiQueue` (libs/standards) has no sender and nothing enqueues to it. The
      server writes its own xAPI statements on completion, so a client ingest endpoint
      would let clients assert completions. Remove the queue and point the offline banner
      at the real outboxes (quiz, completion).
- [ ] **Offline lesson download** (left over from platform Phase 2): `DownloadService`
      (libs/player, unused by the apps) still takes the deprecated Firestore `Module` and
      treats `asset:<id>` refs as not cacheable. Port it to `ApiLesson`, resolve signed
      asset URLs, then wire it back into the course page.

### 3. Games and Rust

- [ ] See `docs/unity-games-plan.md` for what each phase still lacks. Next: the Phase 0
      spikes (forge-sim linked into iOS, Android and WebGL players), the forge-sim wheel
      in the API image, and a WebGL run of the drill against a lesson with a scenario.
- [ ] Admin lesson editor: attach a simulator scenario
      (`PUT /api/standards/lessons/{id}/scenario` exists; no UI yet).

### 4. Housekeeping

- [ ] Run `grep` for stray `X 2.*` / `X 3.*` files now and then (iCloud conflict copies);
      the repo now lives in `SOTERIAFORGE.nosync`, which iCloud skips.
- [ ] Learner `app.component.a11y.spec` can time out when many projects run in parallel
      (passes alone); give it a longer timeout.
