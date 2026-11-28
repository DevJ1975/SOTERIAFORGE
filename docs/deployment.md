# Deployment runbook

For **Railway Django + self-hosted video classrooms**, use the
[LiveKit VPS deployment runbook](../deploy/livekit/README.md) and
[classroom guide](./video-classrooms.md).

For the **local Django + Ollama course tutor**, use the
[local AI tutor guide](./local-ai-tutor.md). It requires the API and inference on
the same host and is disabled by default outside the configured local Mac.

For **Django SCORM imports, Railway Bucket and external xAPI reporting**, use the
[SCORM and xAPI deployment guide](./scorm-cmi5.md). Playback requires a separate
content-only origin/service; never serve executable packages from the API/app
origin. The pilot is feature-disabled until that infrastructure is configured.

For the **AWS environment** (ECS Fargate, RDS, S3) that runs alongside Railway, use
the [AWS runbook](../infra/aws/README.md). It is defined in Terraform under
`infra/aws/` and deployed with `infra/aws/deploy.sh`.

**Railway** hosts everything: the Angular apps (nginx, and Node SSR for the
storefront), the Django API, the SCORM content origin, the SCORM import cron,
Postgres (+ pgvector) and a private bucket. There is no Redis, Celery or other
backend. The step-by-step go-live runbook, with variables, DNS and rollback, is
[railway-go-live-plan.md](./railway-go-live-plan.md).

## Environments

Railway environments: `production` and `staging` (staging tracks
`feat/angular-22-upgrade` until it merges to `main`). The infrastructure is
declared in `.railway/railway.ts`; preview with `railway config plan`, apply with
`railway config apply`. Secrets are never stored there (`preserve()` keeps the value
set in Railway).

## One-time setup

1. **Railway**: create the project; set the secret variables, then apply
   `.railway/railway.ts` (api, content, scorm-worker, learner, admin, superadmin,
   storefront in production, Postgres, bucket). Secrets on the `api` service:
   `DJANGO_SECRET_KEY`, `DB_APP_PASSWORD`, `SENTRY_DSN`, and (for media) the
   Railway Bucket variables. See `backend/.env.example` for the full list.
2. **Database**: migrations run in the service's pre-deploy command, as the
   database owner, then `ensure_app_role` refreshes the non-superuser runtime role
   (`forge_app`) the web process connects as, so row-level security applies.
3. **First superadmin**: `manage.py grant_superadmin --email you@...`, then
   `manage.py set_member_password --email you@...`.
4. **Email** (password reset and invite links): `EMAIL_BACKEND`, `EMAIL_HOST`,
   `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`.
5. **Media bucket**: create a Railway Bucket (S3-compatible) and add its endpoint,
   bucket, keys and region to the API service.
6. **Video** (Phase 2): linked video works out of the box; classrooms use the
   self-hosted LiveKit runbook above.
7. **Open Badges 3.0**: provision the issuer key (Ed25519) + hosted issuer
   profile (see `docs/open-badges.md`).
8. **DNS**: `api.<root>` -> `api`; `*.<root>` -> `learner`; `*.admin.<root>` ->
   `admin`; `app.<root>` -> `superadmin`; apex + `www` -> `storefront`; the content
   origin on its own domain. `<root>` is `soteriaforge.com` in production and
   `staging.soteriaforge.com` in staging.
   Per-tenant custom domains map via `AssuranceEnvironment.customDomains`.

## Deploy

- **API**: push to the tracked branch; once CI passes, Railway builds
  `backend/Dockerfile` (api, content, scorm-worker).
- **Frontends**: the same push builds the root `Dockerfile` (learner, admin,
  superadmin; `APP` selects the app) and `docker/storefront.Dockerfile`.
- **Frontend environment**: `FORGE_API_BASE_URL` (the API's public URL) is a build
  variable on each frontend service. `scripts/forge-env.mjs` writes it into
  `apps/<app>/src/environments/environment.ts` at build time. `vercel.json` still
  works for the learner app and fails the build when it is missing. `FORGE_ROOT_DOMAIN` is optional (default `soteriaforge.com`). If the
  frontend runs on a different site than the API (for example `*.vercel.app`
  previews), also set `AUTH_COOKIE_SAMESITE=None` on the API.

## CI/CD

- CI (`.github/workflows/ci.yml`): `format`, `lint`, `test`, per-project `build`
  matrix, `e2e` (Playwright, non-blocking until browsers/served app are wired) and
  `backend` (ruff, migrations check, pytest on Postgres/pgvector, OpenAPI schema).
- `docker` builds every Railway image and runs `manage.py check --deploy`.
- Deploys are driven by Railway's Git integration, with "Wait for CI" on.

## Provisioning a tenant

See `docs/tenant-provisioning-runbook.md`.
