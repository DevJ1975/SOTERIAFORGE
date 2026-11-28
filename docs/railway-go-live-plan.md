# Railway go-live plan

- **Written:** 2026-11-27, from the working tree of `feat/angular-22-upgrade` and a
  read-only look at the live Railway account. Nothing was created, deployed or changed.
- **Scope:** get Soteria Forge running on Railway (staging, then production). AWS
  (`infra/aws/`) comes later and is out of scope, except that nothing here may break it.
- **Step labels:** `[code]` a change in this repo, `[railway]` an action in Railway
  (dashboard, CLI or IaC), `[manual]` something only a person can do (DNS, accounts,
  secrets, decisions).
- Variable **names only** appear in this document. No secret value was read or recorded.

## 0. Summary

Railway staging already runs the API, but it is three commits and all of Phase 6 behind
the working tree, has only 9 of the variables the code reads, has no custom domain, no
bucket, no frontends and no cron services. Production is an empty environment. The
production branch in the IaC (`main`) is a pre-Django tree with no `backend/` directory,
so production cannot build until a release branch is settled.

The shortest safe path is:

1. Commit and push the Phase 6 work through a pull request so CI runs (Phase A).
2. Do the small, low-risk trim that touches the deploy path (Phase B).
3. Make the Railway code changes: frontend build wiring, IaC, CORS for the chosen host
   layout (Phase C).
4. Bring staging up to date and complete it: variables, domains, bucket, frontends,
   crons (Phase D, steps S1 to S18), and verify it (Phase E).
5. Create production the same way (Phase F).
6. Larger trim and the unit tests that lock this in (Phases G and H).

Sixteen decisions are open (section 14, D1 to D16; "D" numbers always mean decisions, staging steps are "S"). The three that block the most are the
frontend host (Railway or Vercel), the domain layout for learner versus admin, and the
production branch.

## 1. Current state

### 1.1 Repo

| Area               | What is there                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend            | Django **6.1** (not 5) + DRF, Python 3.13, `uv`. ASGI served by `uvicorn` (2 workers by default). `backend/Dockerfile` builds from `backend/` as context.                                                                        |
| IaC                | `.railway/railway.ts` declares project `soteria-forge` with `api`, `postgres`, `redis`. Production tracks `main`, every other environment tracks `feat/angular-22-upgrade`.                                                      |
| Release step       | Pre-deploy: `migrate --noinput` then `ensure_app_role`, both with `DB_USE_OWNER=1`.                                                                                                                                              |
| Health             | `GET /healthz` runs `SELECT 1`. `forge.health.HealthCheckMiddleware` answers it before host and HTTPS checks; `healthcheck.railway.app` is added to `ALLOWED_HOSTS` when `RAILWAY_ENVIRONMENT_NAME` is set.                      |
| Row-level security | The web process connects as `forge_app` (no superuser, no BYPASSRLS) when `DB_APP_PASSWORD` is set. Transaction-mode poolers are refused at start-up.                                                                            |
| Background work    | **No Celery, no Channels.** The platform plan's worker and beat were never built. Scheduled work is three management commands: `process_scorm`, `forward_xapi`, `purge_coach_log`.                                               |
| Redis              | **Not used by any code.** No `REDIS_URL` read in `backend/`, no Redis client in `pyproject.toml`. `infra/aws/README.md` says the same.                                                                                           |
| Storage            | S3-compatible private bucket through `STANDARDS_S3_*` (`apps/standards/storage.py`), shared by SCORM packages and lesson uploads (`assets/` prefix). Django's default file storage is not used for user files.                   |
| Content origin     | `forge.settings_content` is a second, content-only service from the same image. It must be on its own origin.                                                                                                                    |
| LiveKit            | Self-hosted on a separate VPS (`deploy/livekit/`). It cannot run on Railway (host networking, UDP).                                                                                                                              |
| Frontends          | Four Angular 22 apps. Root `Dockerfile` has `static-runtime` (nginx) and `storefront-runtime` (Node SSR) targets, used today only by `docker-compose.yml`. `vercel.json` covers the learner app only.                            |
| API URL wiring     | `scripts/vercel-env.mjs` writes `environment.ts` from `FORGE_API_BASE_URL` and `FORGE_ROOT_DOMAIN`, **only when `VERCEL` is set**. Anywhere else the committed file is used: `https://api.soteriaforge.com`, `soteriaforge.com`. |
| Tenant resolution  | From the page's host: `<tenant>.<rootDomain>`. A Railway-generated `*.up.railway.app` host resolves to no tenant, so tenant apps need a real domain.                                                                             |
| CI                 | `.github/workflows/ci.yml` runs on pull requests and pushes to `main` only. Backend job uses `pgvector/pgvector:pg17`.                                                                                                           |
| Uncommitted        | Phase 6: 23 modified and 12 untracked paths, including `standards/migrations/0007_dispatches.py` and `0008_dispatches_rls.py`.                                                                                                   |
| Unpushed           | 3 commits ahead of `origin/feat/angular-22-upgrade`: `13583aa`, `d3ead0a`, `7131742`.                                                                                                                                            |
| Branches           | `origin/main` last moved 2026-06-19 and has no `backend/`, no `.railway/`, and still has `firebase.json`. `HEAD` is 158 commits ahead of it. The GitHub default branch is `claude/sleepy-gates-Z5G6y`.                           |

### 1.2 Live Railway (read-only, 2026-11-27)

Two projects relate to this repo. Neither is named `soteria-forge`.

**`considerate-bravery`** (`63991890-28f3-4e52-a548-27a04f72caf3`): the live one.

| Environment  | Service                | State                                                                                                                                                                       |
| ------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staging`    | `api`                  | Online, 1 replica, region **`ams`** (Amsterdam). Source `DevJ1975/SOTERIAFORGE`, branch `feat/angular-22-upgrade`, root `backend`, Dockerfile builder, watch `backend/**`.  |
|              |                        | Pre-deploy and `/healthz` (60 s) match the IaC. "Wait for CI" (`checkSuites`) is **off**.                                                                                   |
|              |                        | Active deployment: commit `a02a501`, 2026-11-21. Domain `api-staging-12cc.up.railway.app` (port 8000). No custom domain.                                                    |
|              |                        | Variables set (9): `DATABASE_URL`, `DB_APP_PASSWORD`, `DB_APP_USER`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `FORGE_ROOT_DOMAIN`, `PORT`, `REDIS_URL`. |
|              | `postgres`             | Online, image `ghcr.io/railwayapp-templates/postgres-ssl:18`, one volume. **Postgres 18**; the repo tests on 17 and AWS RDS is 17.                                          |
|              | `redis`                | Online, `redis:8.2`, one volume. Unused by the code.                                                                                                                        |
|              | `@assurance/functions` | No deployment. Left over from the Firebase functions workspace.                                                                                                             |
| `production` | (none)                 | No services configured. One **staged, unapplied patch from 2026-10-27** that updates `@assurance/functions`.                                                                |

Logs for the active staging deployment show a clean start (two uvicorn workers, the MCP
session manager, `/healthz` 200) and since then only internet scanners getting 404s. No
application errors, and no real traffic.

**`soteria-assurance`** (`3f812ee4-7778-4b0a-aa18-d95c8b8d0f49`): `staging` has a
`Postgres` and a `Redis`, both online since 2026-10-14, and no application service.
`production` is empty. Nothing in the repo points at it. It looks abandoned and is
costing money (decision D11).

Not inspected: Vercel. `docs/todo.md` names a Vercel project `soteriaforge` whose build
fails by design until `FORGE_API_BASE_URL` is set. Treat the frontends as **not deployed
anywhere** until someone confirms otherwise.

### 1.3 Gap list

| #   | Gap                                                                                                                                                                                      | Fixed in |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | Staging runs `a02a501`. Missing: 3 unpushed commits and uncommitted Phase 6. Seven migrations are pending there (section 6).                                                             | A, D     |
| G2  | Staging has 9 variables. Missing at least: `FORGE_PUBLIC_URL`, `SENTRY_DSN`, email, bucket, `BADGE_SIGNING_KEY`, `AUTH_LINK_BASE_URL` and the LiveKit four (section 5).                  | D        |
| G3  | No custom domain. Tenant apps cannot resolve a tenant, and the refresh cookie needs the app and API on one site.                                                                         | D        |
| G4  | No bucket. Uploads, SCORM import and `forge_import_media` are off.                                                                                                                       | D        |
| G5  | No frontend is deployed. Outside Vercel the build ignores `FORGE_API_BASE_URL`.                                                                                                          | C, D     |
| G6  | No content-origin service and no cron services.                                                                                                                                          | D        |
| G7  | Production is empty and its IaC branch (`main`) cannot build.                                                                                                                            | F        |
| G8  | IaC drift: project name, no frontends, no bucket, no crons, `DJANGO_ALLOWED_HOSTS` hard-coded to the production host for every environment.                                              | C        |
| G9  | Staging deploys on push with no CI gate: CI does not run on pushes to the feature branch and "Wait for CI" is off.                                                                       | A, D     |
| G10 | Region is Amsterdam. Lakewood is a US tenant.                                                                                                                                            | D (D5)   |
| G11 | Postgres 18 live, 17 in CI, compose and AWS. A dump from 18 does not restore into 17.                                                                                                    | C (D6)   |
| G12 | The CORS rule allows `https://<one-label>.<root>` only. There is no agreed host for the admin and superadmin apps (`admin` and `app` are reserved subdomains that resolve to no tenant). | C (D2)   |
| G13 | The `forge_sim` wheel is built in CI but not installed in the API image, so simulator lessons cannot be scored on Railway.                                                               | later    |
| G14 | Ask Forge (coach) talks only to a local Ollama. It stays off on Railway (`COACH_ENABLED=false`).                                                                                         | D13      |
| G15 | LiveKit VPS does not exist yet for either environment. Engage classrooms and live sessions need it.                                                                                      | D (D8)   |
| G16 | A stale staged patch sits in `production`. Any "apply staged changes" there would act on `@assurance/functions`.                                                                         | D        |

## 2. Target topology

```
                         DNS: soteriaforge.com
   ┌───────────────────────────────┬──────────────────────────────────┐
   │ browsers                      │ LMS / MCP clients                │
   ▼                               ▼                                  ▼
 learner  *.{root}              api   api.{root}              content  (own domain)
 admin    (see D2)               │ uvicorn, 2 workers          same image,
 superadmin                      │ pre-deploy: migrate,        forge.settings_content
 storefront  apex + www          │   ensure_app_role
   (nginx / Node SSR)            │
                                 ├── postgres (pgvector, volume, backups)
                                 ├── bucket   (private, S3 API)
                                 ├── cron: process_scorm   (same image)
                                 ├── cron: forward_xapi    (same image, only with an LRS)
                                 └── cron: purge_coach_log (same image, only with coach)

 Outside Railway:  LiveKit VPS per environment (deploy/livekit)   ·   SMTP   ·   Sentry
```

| Service                | Source                                     | Start                              | Public          | Notes                                                                                  |
| ---------------------- | ------------------------------------------ | ---------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `api`                  | `backend/Dockerfile`, root `backend`       | Dockerfile `CMD` (uvicorn)         | `api.{root}`    | The only service that runs migrations.                                                 |
| `content`              | same image                                 | same `CMD`                         | separate domain | `DJANGO_SETTINGS_MODULE=forge.settings_content`. No pre-deploy. No LRS or MCP secrets. |
| `scorm-worker`         | same image                                 | `python manage.py process_scorm`   | none            | Cron. Runtime role, never `DB_USE_OWNER`. Cap memory.                                  |
| `xapi-forwarder`       | same image                                 | `python manage.py forward_xapi`    | none            | Cron. The only service that holds `XAPI_LRS_AUTH`. Only if an LRS is chosen (D10).     |
| `coach-purge`          | same image                                 | `python manage.py purge_coach_log` | none            | Daily cron. Only once the coach is hosted (D13).                                       |
| `postgres`             | Railway Postgres with pgvector             | image                              | none            | Private networking only. Volume backups on.                                            |
| bucket                 | Railway Bucket                             | n/a                                | none            | Private. One per environment.                                                          |
| `learner`              | root `Dockerfile`, target `static-runtime` | nginx                              | `*.{root}`      | If frontends are on Railway (D1).                                                      |
| `admin`                | same, `APP=admin`                          | nginx                              | per D2          |                                                                                        |
| `superadmin`           | same, `APP=superadmin`                     | nginx                              | per D2          |                                                                                        |
| `storefront`           | root `Dockerfile`, `storefront-runtime`    | `node server/server.mjs`           | apex + `www`    | Needs `NG_ALLOWED_HOSTS`. Production only unless a staging storefront is wanted.       |
| `redis`                | remove                                     |                                    |                 | Unused (D7).                                                                           |
| `@assurance/functions` | remove                                     |                                    |                 | Firebase leftover (D11).                                                               |

**Workers and Celery:** none exist and none are needed for go-live. Do not add a worker
service. The three cron services above replace what the platform plan called worker and
beat.

**Frontend host (D1).** The repo documents Vercel, but only the learner app has a
`vercel.json` and nothing is confirmed deployed. Recommendation: **host the frontends on
Railway**. The Dockerfile targets already exist and are exercised by `docker compose`,
Railway supports wildcard custom domains with managed certificates, it keeps the app and
API on one site so the refresh cookie stays `SameSite=Lax`, and it is the same container
shape AWS will take later. The cost is the code in step C2 and giving up Vercel's edge
cache and per-PR previews. If Vercel is kept instead, skip C2 and the four frontend
services, add a `vercel.json` per app and set `FORGE_API_BASE_URL` on each Vercel
project; everything else in this plan is unchanged.

## 3. Environments

| Environment  | Branch (proposed)                                  | Root domain (proposed)     | API host                       | Data            |
| ------------ | -------------------------------------------------- | -------------------------- | ------------------------------ | --------------- |
| `staging`    | `feat/angular-22-upgrade`, then the release branch | `staging.soteriaforge.com` | `api.staging.soteriaforge.com` | Disposable      |
| `production` | the release branch (D3)                            | `soteriaforge.com`         | `api.soteriaforge.com`         | Real, backed up |

- Tenant hosts on staging are `<tenant>.staging.soteriaforge.com`. This works without code
  changes: the tenant resolver and the CORS rule are both built from `FORGE_ROOT_DOMAIN`.
- App and API share the registrable domain `soteriaforge.com` in both environments, so
  `AUTH_COOKIE_SAMESITE` stays at its default `Lax`.
- Each environment has its own database, bucket, `DJANGO_SECRET_KEY`, `DB_APP_PASSWORD`,
  badge key and LiveKit host. Never copy production secrets into staging.
- Keep both environments in the one live project (`considerate-bravery`, to be renamed
  `soteria-forge` in step C3).
- PR environments are not part of go-live.

## 4. Build, start, health and release commands

| Service                          | Build                                                                                                                                                         | Pre-deploy (release)                                                                                           | Start                                                                                                                | Health check             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `api`                            | Dockerfile `backend/Dockerfile`, root directory `backend`, watch `backend/**`                                                                                 | `sh -c 'DB_USE_OWNER=1 python manage.py migrate --noinput && DB_USE_OWNER=1 python manage.py ensure_app_role'` | image `CMD`: `uvicorn forge.asgi:application --host 0.0.0.0 --port $PORT --workers $WEB_CONCURRENCY --proxy-headers` | `/healthz`, timeout 60 s |
| `content`                        | same                                                                                                                                                          | none                                                                                                           | image `CMD`                                                                                                          | `/healthz`               |
| `scorm-worker`                   | same                                                                                                                                                          | none                                                                                                           | `python manage.py process_scorm`, cron                                                                               | none (exits)             |
| `xapi-forwarder`                 | same                                                                                                                                                          | none                                                                                                           | `python manage.py forward_xapi`, cron                                                                                | none                     |
| `coach-purge`                    | same                                                                                                                                                          | none                                                                                                           | `python manage.py purge_coach_log`, cron `0 4 * * *`                                                                 | none                     |
| `learner`, `admin`, `superadmin` | Dockerfile `Dockerfile`, root directory `/`, target `static-runtime`, build args `APP`, `CONFIGURATION=production`, `FORGE_API_BASE_URL`, `FORGE_ROOT_DOMAIN` | none                                                                                                           | nginx, port 80                                                                                                       | `/`                      |
| `storefront`                     | Dockerfile `Dockerfile`, target `storefront-runtime`, `APP=storefront`                                                                                        | none                                                                                                           | `node server/server.mjs`, port 4000                                                                                  | `/`                      |

Notes:

- Restart policy `ON_FAILURE`, 5 retries, as the IaC already says.
- The pre-deploy command runs in the new image before it takes traffic. A failed
  migration fails the deploy and the old deployment keeps serving.
- `ensure_app_role` also resets the `forge_app` password to `DB_APP_PASSWORD` on every
  deploy, which is how that password is rotated.
- `WEB_CONCURRENCY` defaults to 2. Each worker holds its own database connections
  (`conn_max_age=60`). The MCP server is stateless, so more workers or replicas are safe.
- Railway cron has a minimum interval (five minutes at the time of writing; confirm in
  the dashboard). `docs/scorm-cmi5.md` suggests every minute for `process_scorm`. Use
  `*/5 * * * *`. A package then waits up to five minutes; the command handles five
  packages per run.
- Railway cron services must exit. All three commands do.
- Watch patterns for the frontend services: `apps/**`, `libs/**`, `package.json`,
  `package-lock.json`, `Dockerfile`, `docker/**`, `scripts/**`, so a backend-only push
  does not rebuild four Angular apps.

## 5. Variables and secrets (names only)

`S` = secret, set by hand and kept by `preserve()`; `R` = Railway reference; `P` = plain
value that can live in IaC. "Now" = set on staging `api` today.

### 5.1 `api`

| Variable                                                                                              | Kind | Now | Needed for go-live | Notes                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ---- | --- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                        | R    | yes | yes                | Reference to the Postgres service's private URL. Never a transaction-mode pooler.                              |
| `DJANGO_SECRET_KEY`                                                                                   | S    | yes | yes                | Different per environment. Shared with `content` in the same environment.                                      |
| `DJANGO_DEBUG`                                                                                        | P    | yes | yes                | `false`.                                                                                                       |
| `DJANGO_ALLOWED_HOSTS`                                                                                | P    | yes | yes                | The API's custom host for **that** environment. The Railway domain and health-check host are added by code.    |
| `FORGE_ROOT_DOMAIN`                                                                                   | P    | yes | yes                | `staging.soteriaforge.com` on staging, `soteriaforge.com` on production. Drives CORS and emailed links.        |
| `DB_APP_USER`                                                                                         | P    | yes | yes                | `forge_app`.                                                                                                   |
| `DB_APP_PASSWORD`                                                                                     | S    | yes | yes                | Without it the API runs as the superuser and RLS does nothing.                                                 |
| `PORT`                                                                                                | P    | yes | yes                | 8000, matching the domain's target port.                                                                       |
| `FORGE_PUBLIC_URL`                                                                                    | P    | no  | yes                | `https://api.<root>`. Without it the OAuth issuer follows the Railway domain and breaks when the domain moves. |
| `CSRF_TRUSTED_ORIGINS`                                                                                | P    | no  | yes                | `https://api.<root>`. Django admin and the OAuth sign-in and consent forms post with CSRF.                     |
| `SENTRY_DSN`                                                                                          | S    | no  | yes                | Environment name comes from `RAILWAY_ENVIRONMENT_NAME`.                                                        |
| `SENTRY_TRACES_SAMPLE_RATE`                                                                           | P    | no  | optional           | Default 0.                                                                                                     |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | P    | no  | yes                | Without these, invite and reset emails only print to the log.                                                  |
| `EMAIL_HOST_PASSWORD`                                                                                 | S    | no  | yes                |                                                                                                                |
| `AUTH_LINK_BASE_URL`                                                                                  | P    | no  | no                 | Leave unset so links use each tenant's host. Setting it sends every tenant to one host.                        |
| `AUTH_COOKIE_SAMESITE`                                                                                | P    | no  | no                 | Leave at `Lax`. `None` only if a frontend is on another site (Vercel previews).                                |
| `AUTH_ACCESS_TTL_SECONDS`, `AUTH_REFRESH_TTL_SECONDS`                                                 | P    | no  | no                 | Defaults 15 minutes, 14 days.                                                                                  |
| `CORS_EXTRA_ORIGINS`                                                                                  | P    | no  | depends on D2      | Exact origins outside `https://<label>.<root>`.                                                                |
| `STANDARDS_S3_ENDPOINT`, `STANDARDS_S3_BUCKET`, `STANDARDS_S3_REGION`                                 | R/P  | no  | yes                | From the Railway Bucket. Region `auto`.                                                                        |
| `STANDARDS_S3_ACCESS_KEY`, `STANDARDS_S3_SECRET_KEY`                                                  | R/S  | no  | yes                | Use bucket variable references so no one handles the values.                                                   |
| `STANDARDS_ENABLED`                                                                                   | P    | no  | after content      | `true` only after the content service passes its checks.                                                       |
| `STANDARDS_CONTENT_ORIGIN`                                                                            | P    | no  | with SCORM         | `https://<content host>`.                                                                                      |
| `STANDARDS_APP_ORIGINS`                                                                               | P    | no  | with SCORM         | Exact learner origins, comma-separated. No wildcard, so each tenant host is listed.                            |
| `XAPI_RECORDING_ENABLED`, `XAPI_ACTIVITY_BASE`, `XAPI_LRS_ENDPOINT`                                   | P    | no  | only with an LRS   | Keep `XAPI_ACTIVITY_BASE` stable once used. `XAPI_LRS_AUTH` does **not** go on `api`.                          |
| `BADGE_SIGNING_KEY`                                                                                   | S    | no  | yes                | `manage.py generate_badge_key`. Without it credential endpoints answer 503. Different per environment (D12).   |
| `LIVEKIT_URL`, `LIVEKIT_API_URL`                                                                      | P    | no  | with Engage        | From `deploy/livekit/runtime/railway.env`.                                                                     |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`                                                               | S    | no  | with Engage        | Never the development defaults; the code rejects `devkey` and short secrets.                                   |
| `MCP_REDIRECT_HOSTS`                                                                                  | P    | no  | no                 | Default covers Claude and ChatGPT.                                                                             |
| `MCP_MEDIA_IMPORT_HOSTS`                                                                              | P    | no  | optional           | Empty keeps `forge_import_media` off.                                                                          |
| `RAILWAY_API_TOKEN`, `GITHUB_TOKEN`                                                                   | S    | no  | optional           | MCP release and code tools. The GitHub token must not have Workflows permission.                               |
| `GITHUB_REPO`, `FORGE_STAGING_BRANCH`, `FORGE_PRODUCTION_BRANCH`                                      | P    | no  | if D3 changes      | Defaults: this repo, `feat/angular-22-upgrade`, `main`.                                                        |
| `COACH_ENABLED`, `COACH_LOG_RETENTION_DAYS`                                                           | P    | no  | no                 | Leave off (D13).                                                                                               |
| `WEB_CONCURRENCY`, `WEB_KEEP_ALIVE`, `LOG_LEVEL`, `SECURE_HSTS_SECONDS`                               | P    | no  | no                 | Raise HSTS to 31536000 only after every host is confirmed HTTPS-only.                                          |
| `REDIS_URL`                                                                                           | R    | yes | **remove**         | Nothing reads it (D7).                                                                                         |
| `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`       | auto | yes | yes                | Injected by Railway. The code reads all four.                                                                  |

Do **not** set on Railway: `DB_USE_OWNER` as a service variable (only inline in the
pre-deploy command), `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` /
`DB_SSLMODE` (the AWS form), `FORGE_ENVIRONMENT` (AWS), `STANDARDS_LOCAL_ROOT` and
`SCORM_RUNTIME_PATH` (development only).

### 5.2 Other services

| Service                          | Variables                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`                        | `DJANGO_SETTINGS_MODULE`, `DJANGO_SECRET_KEY` (same as `api`), `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS` (content host), `DATABASE_URL`, `DB_APP_USER`, `DB_APP_PASSWORD`, `STANDARDS_ENABLED`, `STANDARDS_CONTENT_ORIGIN`, `STANDARDS_APP_ORIGINS`, `STANDARDS_S3_*`, `SENTRY_DSN`. No LRS, MCP, LiveKit, email or badge variables. |
| `scorm-worker`                   | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DATABASE_URL`, `DB_APP_USER`, `DB_APP_PASSWORD`, `STANDARDS_ENABLED`, `STANDARDS_S3_*`, `SENTRY_DSN`.                                                                                                                                                                                       |
| `xapi-forwarder`                 | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DATABASE_URL`, `DB_APP_USER`, `DB_APP_PASSWORD`, `XAPI_RECORDING_ENABLED`, `XAPI_ACTIVITY_BASE`, `XAPI_LRS_ENDPOINT`, `XAPI_LRS_AUTH` (S), `SENTRY_DSN`.                                                                                                                                    |
| `coach-purge`                    | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DATABASE_URL`, `DB_APP_USER`, `DB_APP_PASSWORD`, `COACH_LOG_RETENTION_DAYS`.                                                                                                                                                                                                                |
| `learner`, `admin`, `superadmin` | Build-time: `APP`, `CONFIGURATION`, `FORGE_API_BASE_URL`, `FORGE_ROOT_DOMAIN`. Runtime: `PORT` (80). No secrets: everything here ends up in a public bundle.                                                                                                                                                                      |
| `storefront`                     | Build-time as above. Runtime: `PORT` (4000), `NG_ALLOWED_HOSTS`.                                                                                                                                                                                                                                                                  |
| LiveKit VPS                      | Not Railway. Generated by `deploy/livekit/configure.py`; never committed.                                                                                                                                                                                                                                                         |
| GitHub Actions                   | None needed for deploys (Railway's Git integration deploys).                                                                                                                                                                                                                                                                      |

## 6. Migrations

### 6.1 What is pending on staging

Staging's database is at commit `a02a501`. Deploying the current tree applies seven
migrations:

| App            | Migration                            | Kind       | In                 |
| -------------- | ------------------------------------ | ---------- | ------------------ |
| `gamification` | `0005_live_sessions`                 | schema     | unpushed `7131742` |
| `coach`        | `0004_module_scope_and_exchange_log` | schema     | unpushed `d3ead0a` |
| `coach`        | `0005_exchange_rls`                  | RLS policy | unpushed `d3ead0a` |
| `engage`       | `0003_live_sessions`                 | schema     | unpushed `7131742` |
| `engage`       | `0004_session_rls`                   | RLS policy | unpushed `7131742` |
| `standards`    | `0007_dispatches`                    | new table  | **uncommitted**    |
| `standards`    | `0008_dispatches_rls`                | RLS policy | **uncommitted**    |

A new production database gets every migration from zero, including
`coach.0001_initial`, which runs `CREATE EXTENSION vector`. That needs a Postgres image
with pgvector and a superuser connection, which is what `DB_USE_OWNER=1` gives on Railway.

### 6.2 Dispatch migrations 0007 and 0008

- `0007_dispatches` creates `standards_dispatch` (UUID key, `format`, `lms_origins`,
  `revoked`, `created_at`, protected foreign keys to `learning.course`,
  `accounts.member`, `tenants.tenant`). It depends on `accounts.0004_drop_firebase`,
  `learning.0004_lesson_transcript`, `standards.0006_sim_scenarios_rls` and
  `tenants.0003_drop_firebase`. All four are already applied on staging.
- `0008_dispatches_rls` depends on `0007` and runs `policy_sql("standards_dispatch")`:
  `ENABLE` and `FORCE ROW LEVEL SECURITY`, then `CREATE POLICY tenant_isolation` with
  both `USING` and `WITH CHECK`.
- **Ordering.** Django orders by the dependency graph, so `0007` always runs before
  `0008`. They must ship in the **same commit and the same deploy**. If `0007` shipped
  alone, the table would exist with no policy; the runtime role would still be blocked
  only by the views' tenant filter, which is exactly the gap RLS is there to close.
- **Then `ensure_app_role`.** The pre-deploy runs it right after `migrate`. It re-grants
  `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`, which is what gives `forge_app` access
  to `standards_dispatch`. If it were skipped, every dispatch endpoint would fail with a
  permission error. It is the same command line, so it cannot be skipped by accident,
  but it is the first thing to check when a new table returns 500s.
- **Compatibility.** Both are additive. The old code keeps working against the new
  schema while the new image is rolling out.
- **Reverse.** `migrate standards 0006` drops the policy and then the table. That deletes
  every export record, and packages already imported into an LMS would then show the
  inactive-link message. Reverse only on staging.

### 6.3 Procedure

1. `[code]` Before committing: `DJANGO_DEBUG=true uv run python manage.py makemigrations --check --dry-run`
   (CI runs the same). Confirm the two files are added to the commit; they are untracked today.
2. `[code]` `uv run python manage.py migrate --plan` against a local database restored
   to the `a02a501` schema, to see the seven in order.
3. `[railway]` Take a manual backup of the staging Postgres volume before the first
   deploy that carries them. For production, always.
4. `[railway]` Deploy. The pre-deploy log must end with
   `Runtime role forge_app is up to date`.
5. `[manual]` Verify, from the Railway database view or `railway connect postgres`:
   - `SELECT app, name FROM django_migrations WHERE app = 'standards' ORDER BY id DESC LIMIT 2;`
     shows `0008_dispatches_rls` and `0007_dispatches`.
   - `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'standards_dispatch';`
     shows `t`, `t`.
   - `SELECT policyname FROM pg_policies WHERE tablename = 'standards_dispatch';` shows
     `tenant_isolation`.
   - `SELECT has_table_privilege('forge_app', 'standards_dispatch', 'INSERT');` shows `t`.
   - `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'forge_app';` shows `f`, `f`.
   - `SELECT extname FROM pg_extension WHERE extname = 'vector';` returns a row.
6. Rule for later migrations: additive in one deploy, destructive in a later one. The
   pre-deploy runs while the previous version still serves.

## 7. Frontend build and API URL wiring

How it works today: `environment.ts` is compiled into each bundle. The production
configuration has no file replacement, so the committed file wins unless
`scripts/vercel-env.mjs` rewrites it, and that script exits early when `VERCEL` is unset.

Result on Railway without a change: a staging learner build would call
`https://api.soteriaforge.com` and resolve tenants against `soteriaforge.com`.

Changes (step C2):

1. `[code]` Rename `scripts/vercel-env.mjs` to `scripts/forge-env.mjs` and change the
   guard: write the file when `FORGE_API_BASE_URL` is set, on any platform; keep failing
   the build on Vercel when it is missing; keep doing nothing when it is unset elsewhere
   (local, CI, `docker compose`). Update `vercel.json`, `.env.example` and
   `docs/deployment.md` to the new name.
2. `[code]` Root `Dockerfile`, build stage: add `ARG FORGE_API_BASE_URL` and
   `ARG FORGE_ROOT_DOMAIN`, export them, and run `node scripts/forge-env.mjs "${APP}"`
   before `nx build`. Railway passes service variables to matching `ARG`s.
3. `[code]` `docker/nginx.conf`: long cache for hashed assets, `no-cache` for
   `index.html`, and the security headers the API already sets (`nosniff`, a frame
   policy that still lets the learner app frame the content origin). Optional for
   staging, required before production.
4. `[code]` `.dockerignore` already excludes `backend`, `docs`, `mobile` and `.env*`.
   Add `games`, `rust`, `materials`, `infra` and `deploy` to cut the build context.

The API URL is public by design. No secret may ever be passed as a frontend build
argument.

`AssuranceEnvironment.customDomains` (tenant custom domains) is compiled in too. A new
tenant custom domain therefore needs a frontend rebuild plus a custom domain on the
learner service. Out of scope for go-live; note it in the tenant runbook.

## 8. Domains, DNS, CORS, CSRF and cookies

### 8.1 Host layout

| Host                | Service      | Staging                        | Production             |
| ------------------- | ------------ | ------------------------------ | ---------------------- |
| API                 | `api`        | `api.staging.soteriaforge.com` | `api.soteriaforge.com` |
| Learner, per tenant | `learner`    | `*.staging.soteriaforge.com`   | `*.soteriaforge.com`   |
| Admin, per tenant   | `admin`      | open, D2                       | open, D2               |
| Superadmin          | `superadmin` | open, D2                       | open, D2               |
| Storefront          | `storefront` | optional                       | apex and `www`         |
| SCORM content       | `content`    | separate domain, D9            | separate domain, D9    |
| LiveKit             | VPS          | own pair of names              | `video.` and `turn.`   |

**The admin host is undecided and the code does not settle it (G12).** The learner app
takes `<tenant>.<root>`. `admin`, `app`, `api`, `www`, `static` and `assets` are reserved
and resolve to no tenant. Emailed links for platform members go to `app.<root>`. Options:

- **A (recommended):** the admin app gets its own root, `<tenant>.admin.<root>`, by
  building it with `FORGE_ROOT_DOMAIN=admin.<root>`. Superadmin at `app.<root>`. This
  needs the CORS rule widened (step C4) because the current pattern allows one label
  before the root, and a second wildcard domain on the `admin` service.
- **B:** serve admin under a path of the tenant host. Needs routing work in nginx and a
  `base href`; more change, one fewer domain.

An explicit DNS name (`api.<root>`, `app.<root>`) wins over the wildcard, so the API and
the learner wildcard can share a zone.

### 8.2 DNS and certificates

1. `[manual]` Confirm who controls the `soteriaforge.com` zone and where it is hosted
   (D4). `infra/aws/dns.tf` suggests Route 53 may hold or be planned to hold it. Do not
   move the zone as part of this work.
2. `[railway]` Add each custom domain to its service. Railway shows a `CNAME` target and
   a `TXT` ownership record for a plain domain, and two `CNAME`s plus a `TXT` for a
   wildcard.
3. `[manual]` Create those records. For the apex use the DNS host's `ALIAS` or flattened
   `CNAME`. On Cloudflare, follow Railway's wildcard notes (the challenge record must
   not be proxied).
4. `[railway]` Wait for each certificate to issue before pointing anything at the host.
5. `[manual]` Keep the Railway-generated API domain until the custom domain is verified,
   then leave it in place: `RAILWAY_PUBLIC_DOMAIN` is still in `ALLOWED_HOSTS`, and it is
   a useful back door for health checks.

### 8.3 CORS

- Rule in code: `^https://([a-z0-9-]+\.)?<FORGE_ROOT_DOMAIN>$`, with credentials, plus the
  exact origins in `CORS_EXTRA_ORIGINS`. Allowed extra headers: `x-forge-tenant`,
  `x-forge-client`, `x-experience-api-version`.
- With the layout above, learner hosts and `app.<root>` already match. Admin under
  option A does not until step C4.
- Never widen the pattern to a suffix match without the anchors. `test_cors.py` covers
  the current behaviour.
- The content origin must never be listed as a CORS or app origin.
- LMS dispatch: the learner app posts progress to the LMS window, limited to the
  dispatch's `lms_origins`. That is `postMessage`, not CORS, and needs no API setting.

### 8.4 CSRF, cookies, HTTPS

- The API uses bearer tokens, so CSRF applies only to Django admin and the OAuth sign-in
  and consent pages. Set `CSRF_TRUSTED_ORIGINS` to the API's own `https://` origin.
- The refresh cookie `forge_refresh` is `HttpOnly`, `Secure`, path `/api/auth/`,
  host-only on the API host, `SameSite=Lax`. It is sent because the app and the API are
  on the same registrable domain. It would not be sent from `*.up.railway.app` or
  `*.vercel.app` (`up.railway.app` and `vercel.app` are public suffixes), which is why
  the tenant apps need real domains before sign-in can be tested end to end.
- `SECURE_SSL_REDIRECT` is on outside debug, `/healthz` is exempt, and
  `SECURE_PROXY_SSL_HEADER` trusts `X-Forwarded-Proto`. Railway's edge sets it.
- `FORGE_PUBLIC_URL` must equal the API's custom origin before any MCP client connects.
  Changing the issuer later invalidates existing connectors.

## 9. Storage

- `[railway]` Create one private Railway Bucket per environment, in the same region as
  the API.
- `[railway]` Wire `STANDARDS_S3_ENDPOINT`, `STANDARDS_S3_BUCKET`,
  `STANDARDS_S3_ACCESS_KEY`, `STANDARDS_S3_SECRET_KEY` and `STANDARDS_S3_REGION` (`auto`)
  on `api`, `content` and `scorm-worker` with bucket variable references. Bucket
  credentials are read-write with no read-only form, so `content` can write too; accept
  that or front it later.
- Keys: `standards/{tenant}/{package}/upload.zip` and `files/...` for SCORM,
  `assets/...` for lesson uploads (100 MB limit, served by presigned URL).
- The adapter uses path-style addressing and SigV4. With an endpoint set it needs both
  keys; with no endpoint it expects an IAM role (the AWS path). Do not leave the endpoint
  empty on Railway.
- Static files are baked into the image by `collectstatic` and served by WhiteNoise.
  Nothing writes to the container's disk. No Railway volume is needed on `api`.
- Backups: turn on scheduled volume backups for Postgres in production (daily and
  weekly). Consider Railway's point-in-time recovery, which archives to a bucket. There
  is no bucket versioning or retention job; SCORM archive keeps objects forever. Record
  a retention policy before real learner data lands (D12).
- There is no data to migrate: staging has no bucket today and production is empty.

## 10. CI/CD

| Step | Kind        | Action                                                                                                                                                                           |
| ---- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `[code]`    | In `ci.yml`, add the staging and release branches to `on.push.branches`, so a push that Railway deploys has also been tested.                                                    |
| 2    | `[railway]` | Turn on "Wait for CI" for `api` and the frontend services in both environments, so a red commit does not deploy.                                                                 |
| 3    | `[code]`    | Add a `docker` job: build `backend/Dockerfile` and the root `Dockerfile` for each app (no push). Today no CI job builds either image, so a Dockerfile break is found by Railway. |
| 4    | `[code]`    | Decide the Postgres major (D6) and make CI, both compose files and Railway agree.                                                                                                |
| 5    | `[manual]`  | Protect the release branch: pull request, passing CI, no direct pushes.                                                                                                          |
| 6    | `[code]`    | Optional: a `railway config plan` job on pull requests that touch `.railway/`, read-only, to surface IaC drift. Needs a project token as a GitHub secret.                        |

Flow after go-live: feature branch, pull request, CI, merge to the staging branch,
Railway deploys staging, check, pull request staging to release, CI, merge, Railway
deploys production. The MCP tool `forge_open_release_pr` opens that last pull request;
a person merges it.

E2E (`learner-e2e`) stays non-blocking. It has `example.spec.ts` and an Engage media
spec and is not wired to a deployed environment.

## 11. Rollout, with a check after every step

### Phase A. Land the code

| Step | Kind       | Action                                                                                                                                                                                                                                  | Verify                                                                               |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A1   | `[code]`   | Run the full local gate on the working tree: `npx prettier --check .`, `npx nx run-many -t lint test build`, `cd backend && uv run ruff check . && uv run pytest`, `makemigrations --check`, the OpenAPI diff check.                    | All green. `backend/openapi.json` unchanged after regeneration.                      |
| A2   | `[code]`   | Commit Phase 6 on a short branch off `feat/angular-22-upgrade`. Include both dispatch migrations, `dispatch.py`, `dispatch_views.py`, `reports/analytics.py`, the learner `dispatch/` page and the new specs. Do not commit `.claude/`. | `git status` clean apart from `.claude/`. `git show --stat` lists `0007` and `0008`. |
| A3   | `[manual]` | **Before pushing anything to `feat/angular-22-upgrade`:** every push to that branch that touches `backend/**` deploys staging. Either accept that, or pause the staging `api` service's auto-deploy first.                              | Decision recorded.                                                                   |
| A4   | `[code]`   | Open a pull request into `feat/angular-22-upgrade`.                                                                                                                                                                                     | CI green on the pull request, including `backend` on Postgres and the four builds.   |

### Phase B. Deploy-path trim (before the rollout, see section 15 for why)

| Step | Kind     | Action                                                                                                                                                               | Verify                                                                                   |
| ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| B1   | `[code]` | Apply Tier 1 from section 15: `gunicorn`, `@ngrx/store`, `@angular/cdk` if confirmed, Redis from the IaC and `backend/docker-compose.yml`, the stale doc references. | `uv lock` and `npm install` succeed; full gate from A1 green; both images build locally. |
| B2   | `[code]` | Same pull request or the next one. Nothing in Tier 2 or Tier 3 moves yet.                                                                                            | Diff touches no file under `infra/aws/`.                                                 |

### Phase C. Railway code changes

| Step | Kind     | Action                                                                                                                                                                                                                                                                                                                                                                                                                      | Verify                                                                                                                                                                                                                                                                                                           |
| ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | `[code]` | Settle D1 to D3 and D6 first. They change what C2 to C4 contain.                                                                                                                                                                                                                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                  |
| C2   | `[code]` | Frontend wiring from section 7.                                                                                                                                                                                                                                                                                                                                                                                             | `docker build --target static-runtime --build-arg APP=learner --build-arg FORGE_API_BASE_URL=https://api.staging.soteriaforge.com --build-arg FORGE_ROOT_DOMAIN=staging.soteriaforge.com .` then grep the built `main-*.js` for the staging API host. `docker compose up --build` still works with no arguments. |
| C3   | `[code]` | Update `.railway/railway.ts`: per-environment `DJANGO_ALLOWED_HOSTS` and `FORGE_ROOT_DOMAIN`; add `FORGE_PUBLIC_URL`, `CSRF_TRUSTED_ORIGINS`, email, bucket and `BADGE_SIGNING_KEY` entries (`preserve()` for secrets); add `content`, `scorm-worker` and the frontend services; drop `redis` if D7 says so; set the production branch per D3; keep the `postgres` resource name so the plan does not replace the database. | `npx tsc --noEmit` on the file. No plan or apply yet.                                                                                                                                                                                                                                                            |
| C4   | `[code]` | If D2 is option A: widen CORS by an explicit second pattern for the admin root (for example a `FORGE_ADMIN_ROOT_DOMAIN` setting building the same anchored regex), and add cases to `backend/tests/test_cors.py`.                                                                                                                                                                                                           | `uv run pytest tests/test_cors.py`.                                                                                                                                                                                                                                                                              |
| C5   | `[code]` | CI changes from section 10 (steps 1, 3, 4).                                                                                                                                                                                                                                                                                                                                                                                 | The new `docker` job is green on the pull request.                                                                                                                                                                                                                                                               |
| C6   | `[code]` | Update `docs/deployment.md`, `docs/todo.md` and `README.md` to match (Django 6, the real host for frontends, no Celery, cron services). This file becomes the runbook they link to.                                                                                                                                                                                                                                         | Prettier check passes.                                                                                                                                                                                                                                                                                           |

### Phase D. Staging

| Step | Kind                     | Action                                                                                                                                                                                                                                            | Verify                                                                                                                                              |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1   | `[railway]`              | Discard the stale staged patch in `production` and delete the `@assurance/functions` service (after D11).                                                                                                                                         | `production` shows no pending work. The service list is `api`, `postgres` and, until D7, `redis`.                                                   |
| S2   | `[railway]`              | Rename the project to `soteria-forge` so it matches the IaC and the docs.                                                                                                                                                                         | `railway status` shows the new name; staging `api` still online.                                                                                    |
| S3   | `[manual]`               | Decide the region (D5). If moving, do it now while staging data is disposable: move the Postgres volume and the services together.                                                                                                                | All services in one region; API to database latency is a few milliseconds.                                                                          |
| S4   | `[railway]`              | Check the database: connect and run the `pg_extension` query from 6.3. If pgvector is missing, or D6 chooses Postgres 17, replace the staging database with the pgvector template at the chosen major now.                                        | `vector` extension present; version as decided.                                                                                                     |
| S5   | `[railway]`              | Take a manual backup of the staging Postgres volume.                                                                                                                                                                                              | Backup listed.                                                                                                                                      |
| S6   | `[railway]`              | Create the staging bucket. Add the `STANDARDS_S3_*` references on `api`. Leave `STANDARDS_ENABLED` off.                                                                                                                                           | Variables present by name.                                                                                                                          |
| S7   | `[manual]`               | Generate and set secrets on staging `api`: `SENTRY_DSN`, the email set, `BADGE_SIGNING_KEY`. Set `FORGE_ROOT_DOMAIN`, `FORGE_PUBLIC_URL`, `CSRF_TRUSTED_ORIGINS`, `DJANGO_ALLOWED_HOSTS` for the staging hosts. Remove `REDIS_URL` if D7 says so. | Variable names match section 5.1. Nothing pasted into chat, tickets or commits.                                                                     |
| S8   | `[railway]`              | Add the custom domain `api.staging.soteriaforge.com` to `api`.                                                                                                                                                                                    | Records shown.                                                                                                                                      |
| S9   | `[manual]`               | Create the DNS records. Wait for the certificate.                                                                                                                                                                                                 | `curl -s https://api.staging.soteriaforge.com/healthz` returns `{"ok": true}`.                                                                      |
| S10  | `[railway]`              | Link the CLI to the project and the `staging` environment. Run `railway config plan`. **Read the whole plan.** It must not delete or replace `postgres` or any volume.                                                                            | Plan shows only the intended additions and variable changes. If it shows a database or volume delete, stop and fix the IaC.                         |
| S11  | `[code]`                 | Merge the pull requests from A, B and C into `feat/angular-22-upgrade`.                                                                                                                                                                           | Railway starts a deployment of `api` on the merge commit.                                                                                           |
| S12  | `[railway]`              | Watch the deployment. Pre-deploy applies the seven migrations.                                                                                                                                                                                    | Build log ends cleanly; pre-deploy log lists each migration `OK` and `Runtime role forge_app is up to date`; health check passes; status `SUCCESS`. |
| S13  | `[manual]`               | Run the SQL checks from 6.3.                                                                                                                                                                                                                      | All six pass.                                                                                                                                       |
| S14  | `[railway]`              | `railway config apply` for staging (after S10 is clean), or create the remaining services by hand to match section 4: `content`, `scorm-worker`, `learner`, `admin`, `superadmin`. Turn on "Wait for CI".                                         | Each service builds and is online; crons show a next run time.                                                                                      |
| S15  | `[railway]` + `[manual]` | Add `*.staging.soteriaforge.com` to `learner`, the admin and superadmin hosts per D2, and the content host per D9. Create the DNS records.                                                                                                        | Certificates issued. `https://lakewood.staging.soteriaforge.com/` serves the learner shell.                                                         |
| S16  | `[manual]`               | Create the first accounts. `seed_demo` refuses to run outside debug, so use `railway run` (or the service shell) with `DB_USE_OWNER=1`: create a tenant through superadmin, `grant_superadmin --email`, `set_member_password --email`.            | Sign-in to the superadmin app works.                                                                                                                |
| S17  | `[manual]`               | LiveKit staging VPS, only if Engage is in scope (D8): follow `deploy/livekit/README.md`, then import the four variables on `api` and redeploy.                                                                                                    | That runbook's acceptance checks 1 to 5.                                                                                                            |
| S18  | `[railway]`              | Set `STANDARDS_CONTENT_ORIGIN` and `STANDARDS_APP_ORIGINS` on `api` and `content`, then `STANDARDS_ENABLED=true` on `api`, `content` and `scorm-worker`.                                                                                          | Admin console's SCORM page shows storage and content origin as configured.                                                                          |

### Phase E. Staging acceptance

Run in order. Stop at the first failure.

1. `GET /healthz` on the custom API host: 200.
2. `GET /api/schema`: 200, and it lists `/api/standards/dispatches`.
3. Browser on `https://lakewood.staging.soteriaforge.com`: sign in. In the network tab
   the preflight to the API returns `access-control-allow-origin` for that origin with
   credentials, and `/api/auth/login` sets `forge_refresh`.
4. Reload the page: the session is restored through `/api/auth/refresh`. This proves the
   cookie and SameSite set-up.
5. Request a password reset: the email arrives, and its link points at the tenant's
   staging host.
6. Tenant isolation: sign in as a member of a second tenant and confirm the first
   tenant's course is not listed. Then, as that member, call a first-tenant course ID
   directly: 404.
7. Upload a lesson file in admin: object appears in the bucket under `assets/`, and the
   learner can open it by presigned URL.
8. Upload a small SCORM 1.2 package, wait for the cron, attach it, enrol, launch,
   bookmark, leave, resume, complete.
9. **Dispatch (Phase 6):** in admin, create a SCORM 1.2 export and a cmi5 export for a
   published course; download both; `GET /api/standards/dispatches` lists them; revoke
   one and confirm its package download and launch link stop. Import the SCORM package
   into the target LMS when D10 names it.
10. Analytics page and at-risk list load for an instructor and return 403 for a learner.
11. Award a badge and open its `/credentials/<id>` page; run the credential through a
    public Open Badges 3.0 validator.
12. MCP: add `https://api.staging.soteriaforge.com/mcp` as a connector, sign in, list
    courses, create a draft course.
13. Trigger a test error and see it in Sentry tagged `staging`, with no learner email or
    name in the event.
14. Redeploy `api` with no changes and confirm the pre-deploy is a no-op and there is no
    dropped request (`curl` loop on `/healthz` during the roll).
15. Restore drill: restore the S5 backup into a scratch service and connect to it.

### Phase F. Production

| Step | Kind                     | Action                                                                                                                                                                                                                                             | Verify                                                                                      |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F1   | `[manual]`               | Settle the release branch (D3). `main` is 158 commits behind and has no backend. Either merge the staging branch into `main` by pull request, or make another branch the production branch and set `FORGE_PRODUCTION_BRANCH` and the IaC to match. | The release branch contains `backend/Dockerfile` and `.railway/railway.ts`. CI green on it. |
| F2   | `[railway]`              | In `production`: create Postgres (pgvector, chosen major, chosen region) and the bucket. Turn on scheduled backups.                                                                                                                                | `vector` available; backups scheduled.                                                      |
| F3   | `[manual]`               | Generate **new** production secrets: `DJANGO_SECRET_KEY`, `DB_APP_PASSWORD`, `BADGE_SIGNING_KEY` (subject to D12), email, Sentry. Set every variable in section 5.1 for production hosts.                                                          | Names match section 5.1. `DJANGO_DEBUG=false`.                                              |
| F4   | `[railway]`              | Link the CLI to `production`. `railway config plan`. Read all of it.                                                                                                                                                                               | Additions only.                                                                             |
| F5   | `[railway]`              | Apply. First deploy of `api` migrates from zero.                                                                                                                                                                                                   | Pre-deploy lists every migration; `SUCCESS`; `/healthz` 200 on the Railway domain.          |
| F6   | `[manual]`               | SQL checks from 6.3, plus `SELECT count(*) FROM pg_policies WHERE policyname = 'tenant_isolation';` equals the staging count.                                                                                                                      | Same numbers as staging.                                                                    |
| F7   | `[railway]` + `[manual]` | Custom domains and DNS for `api.soteriaforge.com`, `*.soteriaforge.com`, admin and superadmin per D2, apex and `www` for the storefront, the content host. Lower DNS TTLs a day ahead if records already exist.                                    | Certificates issued for every host.                                                         |
| F8   | `[railway]`              | Deploy `content`, `scorm-worker`, the four frontends.                                                                                                                                                                                              | All online.                                                                                 |
| F9   | `[manual]`               | First superadmin, then provision Lakewood with `docs/tenant-provisioning-runbook.md`.                                                                                                                                                              | Lakewood admin can sign in.                                                                 |
| F10  | `[manual]`               | LiveKit production VPS (D8), on separate hosts and credentials from staging.                                                                                                                                                                       | The LiveKit runbook's acceptance checks, including the 21-participant load test.            |
| F11  | `[manual]`               | Run Phase E against production with a throwaway tenant, then delete or archive that tenant.                                                                                                                                                        | All pass.                                                                                   |
| F12  | `[manual]`               | Raise `SECURE_HSTS_SECONDS` to 31536000 after a week with every host HTTPS-only. Set Sentry and Railway alerts: API 5xx rate, health check failures, Postgres disk, cron failures, oldest pending xAPI row.                                        | Alerts fire on a test.                                                                      |

### Phase G. Larger trim

After production has been stable for a week. Section 15, Tiers 2 and 3.

### Phase H. Unit tests

Section 16. The tests for settings, health, storage and the dispatch migrations belong
with Phases B and C and should merge with them; the rest follows the Phase G trim.

## 12. Rollback

| Situation                          | Action                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build fails                        | Nothing to do. The previous deployment keeps serving.                                                                                                                                                                                                                   |
| Pre-deploy (migration) fails       | The deploy stops and the old version serves. Each migration is atomic, so the database is at the last migration that succeeded. Fix forward. If an earlier migration in the same run changed the schema, the old code is still compatible because changes are additive. |
| Health check fails                 | Same: the new deployment never takes traffic.                                                                                                                                                                                                                           |
| Bad release that passed its checks | `[railway]` Roll back to the previous deployment (the active staging deployment is marked rollback-capable). The schema stays ahead of the code, which is safe for additive migrations.                                                                                 |
| A migration must be undone         | `[railway]` Run `DB_USE_OWNER=1 python manage.py migrate <app> <previous>` from the service shell, **then** roll the code back. For `standards 0006` this deletes all dispatch rows; on production restore from backup instead if any export has been issued.           |
| Data damage                        | `[railway]` Restore the Postgres volume backup taken before the deploy, or use point-in-time recovery if enabled. Then roll the code back to the matching commit.                                                                                                       |
| Bad variable                       | `[railway]` Put the old value back and redeploy. Keep the previous `DJANGO_SECRET_KEY` reachable until the new one is proven: changing it signs everyone out and breaks in-flight SCORM launches and signed asset links.                                                |
| Bad IaC apply                      | `[code]` Revert the commit, `railway config plan`, apply. Never apply a plan that deletes a database or a volume.                                                                                                                                                       |
| DNS or certificate problem         | `[manual]` Point the record back. The Railway-generated API domain keeps working throughout.                                                                                                                                                                            |
| Frontend regression                | `[railway]` Roll back that frontend service alone. Frontends hold no state. A frontend that is older than the API is safe; the reverse (new frontend, old API) is not, so deploy the API first.                                                                         |
| LiveKit                            | Restore the previous four variables and the VPS configuration together, as its runbook says.                                                                                                                                                                            |
| The whole go-live                  | Staging is disposable. Production has no users before F9, so before that point the rollback is to delete the production services and start again.                                                                                                                       |

## 13. Risks

| #   | Risk                                                                                                                                                                      | Likelihood | Impact     | Mitigation                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `railway config apply` replaces or deletes the live Postgres because the IaC resource and the live service differ (name, image, project).                                 | Medium     | High       | Backup first; plan before every apply; refuse any plan with a delete. Creating services by hand is an acceptable fallback.                                                                  |
| R2  | How `preserve()` treats a variable that has never been set is unverified here.                                                                                            | Medium     | Medium     | Set every secret before the first apply. Check the plan for variable removals.                                                                                                              |
| R3  | A push to the staging branch deploys untested code (G9).                                                                                                                  | High       | Medium     | Section 10 steps 1 and 2.                                                                                                                                                                   |
| R4  | Migrations `0007` and `0008` are untracked; a partial commit ships a model with no migration, or a table with no policy.                                                  | Medium     | High       | A1 and A2; CI's `makemigrations --check`; the test in section 16.                                                                                                                           |
| R5  | `DB_APP_PASSWORD` missing in a new environment: the API runs as the superuser and RLS is silently bypassed.                                                               | Low        | High       | `ensure_app_role` fails the pre-deploy when it is unset, so a deploy cannot succeed without it. Add the start-up test in section 16.                                                        |
| R6  | pgvector is not in the Postgres image for a new environment; `coach.0001` fails on the first production deploy.                                                           | Low        | Medium     | F2 check before F5. Staging's successful deploys suggest the current image has it; S4 confirms.                                                                                             |
| R7  | Postgres 18 on Railway, 17 on AWS: a later move to AWS cannot restore an 18 dump into 17.                                                                                 | Medium     | High later | D6 now, while production is empty.                                                                                                                                                          |
| R8  | Amsterdam region for a US tenant: latency, and a data-location question for education records.                                                                            | High       | Medium     | D5 before production data exists.                                                                                                                                                           |
| R9  | The admin and superadmin hosts are undecided; CORS blocks whatever is chosen if it is not one label under the root.                                                       | High       | Medium     | D2 and C4 before S15.                                                                                                                                                                       |
| R10 | `STANDARDS_APP_ORIGINS` takes exact origins. Every new tenant needs it updated on two services or SCORM playback fails for that tenant.                                   | High       | Medium     | Add to the tenant runbook. Consider deriving it from the root domain later.                                                                                                                 |
| R11 | Railway cron cannot run every minute; SCORM processing lags, and a run that overlaps the next is skipped.                                                                 | Medium     | Low        | Five-minute schedule. If that is too slow, make `process_scorm` loop in a long-running service.                                                                                             |
| R12 | Two uvicorn workers and several services against one small Postgres exhaust connections.                                                                                  | Low        | Medium     | Watch `pg_stat_activity` in Phase E. Do not add a transaction pooler: the settings refuse it and RLS depends on sessions.                                                                   |
| R13 | A single Postgres with no replica is a single point of failure.                                                                                                           | Medium     | High       | Backups and the restore drill (E15). Railway's HA conversion exists if needed.                                                                                                              |
| R14 | Secrets leak through a frontend build argument or a pasted `railway.env`.                                                                                                 | Low        | High       | Section 5 rules; frontends get public values only.                                                                                                                                          |
| R15 | The MCP release tools hold `RAILWAY_API_TOKEN` and `GITHUB_TOKEN` inside the API process.                                                                                 | Low        | High       | Leave both unset for go-live. Add them later with the narrowest scope.                                                                                                                      |
| R16 | Go-live work changes `backend/Dockerfile`, settings or storage in a way that breaks the AWS path.                                                                         | Medium     | Medium     | Do not edit `infra/aws/`. Keep the `DB_HOST` branch, the IAM-role storage branch, `WEB_KEEP_ALIVE`, `FORGE_ENVIRONMENT` and the private-IP health answer. The tests in section 16 pin them. |
| R17 | Features that cannot work on Railway yet are assumed to: Ask Forge (local Ollama only), simulator scoring (`forge_sim` wheel absent), xAPI forwarding (no LRS), captions. | High       | Low        | Leave them off and say so in the release notes.                                                                                                                                             |
| R18 | The dispatch feature has not been run against a real LMS.                                                                                                                 | High       | Medium     | D10; do not tell a tenant it works before the import test.                                                                                                                                  |
| R19 | Trim removes something used through a string, a template or a dynamic import.                                                                                             | Medium     | Medium     | Tiers and evidence in section 15; build and test gates; Tier 2 and 3 wait until production is stable.                                                                                       |
| R20 | The abandoned project and unused Redis instances keep billing.                                                                                                            | High       | Low        | D7 and D11.                                                                                                                                                                                 |

## 14. Decisions only you can make

| #   | Decision                                                                                                                                     | Recommendation                                                                                                | Blocks        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| D1  | Frontends on Railway or on Vercel?                                                                                                           | Railway (section 2).                                                                                          | C2, C3, S14   |
| D2  | Hosts for the admin and superadmin apps.                                                                                                     | `<tenant>.admin.<root>` and `app.<root>`.                                                                     | C4, S15       |
| D3  | Which branch is production? `main` is a pre-Django tree; the GitHub default is `claude/sleepy-gates-Z5G6y`.                                  | Merge the staging branch into `main` by pull request and make `main` the default again.                       | F1            |
| D4  | Who controls the `soteriaforge.com` zone, and is `staging.soteriaforge.com` acceptable as the staging root?                                  | Yes, a sub-zone of the same domain keeps cookies same-site.                                                   | S8, S15, F7   |
| D5  | Region: stay in Amsterdam or move to a US region?                                                                                            | US, before production exists.                                                                                 | S3, F2        |
| D6  | Postgres major: 18 (what staging runs) or 17 (CI, compose, AWS RDS)?                                                                         | 17 everywhere until AWS RDS offers the same major you run on Railway.                                         | S4, F2, C5    |
| D7  | Remove Redis (service, variable, IaC, compose)? Nothing uses it.                                                                             | Remove. Add it back when rate limiting or Channels is actually built.                                         | B1, C3, S7    |
| D8  | Is Engage (video classrooms, live sessions) part of go-live? It needs a VPS per environment and a provider and budget for it.                | Staging VPS now, production VPS before the first live cohort.                                                 | S17, F10      |
| D9  | Domain for the SCORM content origin. The docs prefer a separate registrable domain with no app cookies.                                      | Buy a separate domain. A subdomain of `soteriaforge.com` is same-site with the app and weakens the isolation. | S15, S18      |
| D10 | Which LMS does Lakewood use, and do they want xAPI in an LRS (which one)?                                                                    | Needed for the Phase 6 exit gate.                                                                             | E9, forwarder |
| D11 | Delete the `soteria-assurance` project, the `@assurance/functions` service and the stale production patch?                                   | Yes, after confirming the `soteria-assurance` database holds nothing you need.                                | S1            |
| D12 | Badge signing key: reuse the key already on AWS for Railway production, or issue a new one? And the retention policy for the bucket.         | One production key in one place at a time; a second issuer key means two issuer profiles to verify against.   | F3            |
| D13 | AI tutor hosting. Ask Forge only talks to a local Ollama model.                                                                              | Leave off for go-live.                                                                                        | none          |
| D14 | Email provider and the from-address domain (SPF and DKIM records are yours to add).                                                          |                                                                                                               | S7, F3        |
| D15 | Railway plan and spend limit; who else gets project access.                                                                                  |                                                                                                               | F             |
| D16 | Trim: approve each Tier 2 and Tier 3 item in section 15, especially the unused game components and `libs/player`, which may be planned work. | Keep anything `docs/unity-games-plan.md` still needs.                                                         | G             |

## 15. Unused code and bloat to trim

Plan only. Nothing was deleted. Method: `grep` for imports and symbol references across
`apps/`, `libs/`, `backend/`, `scripts/`; `tsconfig.base.json` path aliases checked for
importers outside their own library; `INSTALLED_APPS` and `forge/urls.py` compared with
`backend/apps/`; each exported TypeScript symbol checked for a non-spec reference.
Static search cannot see string-based or dynamic use, so every item carries a confidence
level and is gated by build and tests.

**Why part of this goes before the rollout.** Tier 1 is small and touches exactly what
the deploy uses: the dependency lock files both images install from, the IaC, and the
compose file. Doing it first means the images Railway builds for the first production
deploy are the ones that stay, the IaC does not provision a Redis only to remove it, and
the unit tests in section 16 are written once against the final shape. Tiers 2 and 3
remove whole libraries and components. They lower no deploy risk (unused Angular code is
tree-shaken out of the bundles and never reaches the API image), and a mistake there
would land in the middle of go-live, so they wait until production is stable.

### Tier 1: before the rollout (Phase B)

| Item                                                                                                                                       | Evidence it is unused                                                                                                                                                                                | Confidence | Risk of removing                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `gunicorn` in `backend/pyproject.toml`                                                                                                     | No import anywhere in `backend/`. The image `CMD`, `docker-compose.yml` and `infra/aws` all start `uvicorn` directly. The only mention is the dependency line.                                       | High       | Low. Confirm `infra/aws/ecs.tf` does not override the command with gunicorn before removing (read it, do not edit it).            |
| `backend/forge/wsgi.py` and `WSGI_APPLICATION`                                                                                             | Nothing serves WSGI: every start command is `forge.asgi:application`.                                                                                                                                | Medium     | Low, but `manage.py runserver` reads `WSGI_APPLICATION`. Keep the file; listed so nobody removes it with gunicorn.                |
| Redis: `redis` in `.railway/railway.ts`, `REDIS_URL` on `api`, the `redis` service in `backend/docker-compose.yml`, the live Redis service | No `REDIS_URL`, `redis`, `celery` or `channels` reference in `backend/apps` or `backend/forge`; no Redis client in `pyproject.toml`; `infra/aws/README.md` line 80 says the backend does not use it. | High       | Low. Deleting the live service deletes its volume, which holds nothing. Needs D7.                                                 |
| `@ngrx/store` in `package.json`                                                                                                            | No import in `apps/` or `libs/`. Only `@ngrx/signals` is imported (by `libs/lms-core/src/lib/course.store.ts`).                                                                                      | High       | Low. Check `npm ls @ngrx/store` for a peer requirement from `@ngrx/signals` first.                                                |
| `@angular/cdk` in `package.json`                                                                                                           | No import in `apps/` or `libs/`.                                                                                                                                                                     | Medium     | Medium. `primeng` and `jest-preset-angular` declare it as a peer. Remove only if `npm ls` shows nothing in use needs it.          |
| `@angular/platform-browser-dynamic`                                                                                                        | No import; the apps bootstrap with `bootstrapApplication`.                                                                                                                                           | Medium     | Low to medium. Jest's Angular preset can require it for the test bed. Remove, run all specs, restore if any fail.                 |
| `@swc-node/register`, `@swc/core`, `ts-node`, `jest-util`, `@nx/workspace`, `@angular-devkit/core`, `@angular-devkit/schematics` (dev)     | No import and no reference in `nx.json`, `jest.preset.js`, `jest.config.ts`, `eslint.config.mjs` or any `project.json`.                                                                              | Medium     | Low. Nx loads TypeScript configs through one of the SWC or `ts-node` packages, so remove one at a time and run lint, test, build. |
| `@assurance/functions` service and the staged patch (Railway)                                                                              | No `apps/functions` in the tree; the platform plan records its removal; no deployment in either environment.                                                                                         | High       | None. Needs D11.                                                                                                                  |
| `soteria-assurance` Railway project                                                                                                        | No reference in the repo; only a Postgres and a Redis with no application since 2026-10-14.                                                                                                          | Medium     | Data loss if that database holds something. Look before deleting. Needs D11.                                                      |
| References to `backend/scripts/e2e_emulator.sh`                                                                                            | The file does not exist (`backend/scripts/` holds only `engage_load.py`). Still cited in `docs/forge-platform-plan.md` line 224 and `docs/rust-backend-rewrite-plan.md`.                             | High       | None. Docs only.                                                                                                                  |
| `docs/deployment.md` statements that are no longer true                                                                                    | Says Railway hosts Redis as part of the backend and that Vercel hosts all apps; `README.md` says the same. Only the learner app has a `vercel.json`.                                                 | High       | None. Rewrite in C6.                                                                                                              |
| `.firebase/` directory at the repo root                                                                                                    | Not tracked (no `git ls-files` output); local cache from the Firebase CLI.                                                                                                                           | High       | None. Local delete.                                                                                                               |

### Tier 2: after production is stable (Phase G)

| Item                                                                                                                                                                  | Evidence it is unused                                                                                                                                                 | Confidence | Risk of removing                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/player` (`DownloadService`, `VideoPlayerComponent`, `fake-indexed-db.testkit.ts`)                                                                               | The alias `@assurance/player` has **zero** importers outside the library. `docs/todo.md` says `DownloadService` is unused and still takes the Firestore-era `Module`. | High       | Medium. `docs/todo.md` queues a port of offline download onto it. Decide: port it or remove it. Also remove the path alias and Nx project.     |
| `libs/games` components: `phaser-host.component.ts` (723 lines), `accessible-card-game.component.ts` (466), `unity-embed.component.ts`, `rive-character.component.ts` | The alias `@assurance/games` has zero importers; only `@assurance/games/model` is used (by `admin`). Each class is referenced only by its own spec.                   | High       | Medium to high. `docs/unity-games-plan.md` may still need `unity-embed`. Ask before removing; the card-game model must stay.                   |
| `libs/standards`: `scorm-player.component.ts`, `manifest.ts`, `verbs.ts`                                                                                              | `ScormPlayerComponent` and the manifest helpers are referenced only by specs; `verbs.ts` has no reference at all. The learner app has its own managed SCORM page.     | Medium     | Medium. Confirm the learner's SCORM route does not load the component by a lazy string path.                                                   |
| `libs/standards/src/lib/offline-xapi-queue.service.ts`                                                                                                                | Injected by `apps/learner/src/app/app.component.ts` but, per `docs/todo.md`, nothing enqueues to it and it has no sender.                                             | Medium     | Medium. The learner's offline banner reads it; repoint the banner at the quiz and completion outboxes in the same change.                      |
| `libs/shared/src/lib/schemas/course.ts`                                                                                                                               | Every export is marked `@deprecated Firestore-era`. Exported from `libs/shared/src/index.ts`; remaining users are the unused `libs/player` and `course.store.ts`.     | Medium     | Medium. Remove together with `libs/player` and `course.store.ts`, and let the compiler find any other user.                                    |
| `libs/lms-core`: `course.store.ts`, `progress.ts`                                                                                                                     | Referenced only by their own specs. `course.store.ts` is the only user of `@ngrx/signals`.                                                                            | Medium     | Low to medium. Removing the store also frees `@ngrx/signals`.                                                                                  |
| `libs/gamification`: `xp.service.ts`, `leaderboard.ts`, `xp-badge.component.ts`                                                                                       | Referenced only by specs. XP and leaderboards are computed by the API now.                                                                                            | Medium     | Low. Two files in the library are still imported by `learner`; keep those.                                                                     |
| `libs/shared/src/lib/util/quiz-grading.ts`, `util/vector.ts`                                                                                                          | Referenced only by specs. Grading is server-side (`backend/apps/assessments/grading.py`); vectors are in pgvector.                                                    | Medium     | Low. Check the learner's offline quiz outbox does not grade locally.                                                                           |
| `libs/ui`: `assurance-button`, `assurance-card`, `bottom-nav`, `language-switcher` components                                                                         | `AssuranceButtonComponent` has no reference; the other three are referenced only by specs.                                                                            | Medium     | Low. They are design-system pieces; removal is tidy-up, not a saving in the bundle.                                                            |
| `requests` **or** `httpx` in `backend/pyproject.toml`                                                                                                                 | Both are imported (2 and 3 files). Two HTTP clients for the same job.                                                                                                 | Low        | Medium. `mcp` depends on `httpx`, so `requests` is the one to fold in. Behaviour around redirects and timeouts must be re-tested (SSRF guard). |

### Tier 3: flag only, do not remove

| Item                                                                            | Why it is flagged                                                                                                                                                                         | Action                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `infra/aws/` (Terraform, `deploy.sh`, README)                                   | Not used by Railway. It is the next target. `terraform.tfstate`, its backup and `terraform.tfvars` sit in the working tree; `infra/aws/.gitignore` ignores them and they are not tracked. | **Keep as is.** Do not edit. Consider remote state before AWS work starts.          |
| AWS branches in `backend/forge/settings.py` and `storage.py`                    | `DB_HOST` and friends, `DB_SSLMODE`, `FORGE_ENVIRONMENT`, `WEB_KEEP_ALIVE`, the IAM-role path with no endpoint and no keys, the private-IP health answer. Dead on Railway.                | **Keep.** Section 16 adds tests so the trim cannot break them.                      |
| `vercel.json`, `scripts/vercel-env.mjs`                                         | Unused if D1 chooses Railway.                                                                                                                                                             | Keep until D1 is final and production is live; then remove or rename per section 7. |
| `docs/rust-backend-rewrite-plan.md`, `docs/native-parity-plan.md`               | 20 and 16 Firebase mentions. They describe plans against the old architecture.                                                                                                            | Mark as historical at the top or move to `docs/archive/`. Your call.                |
| `docs/forge-platform-plan.md` sections 1 to 3                                   | 45 Firebase mentions; the file itself says those sections are a historical record. It also describes Celery, beat and Channels that were never built.                                     | Leave. Add one line pointing here for the actual topology.                          |
| `backend/apps/*/migrations/*drop_firebase*` and earlier Firebase-era migrations | Not dead: they are the schema history a new database replays.                                                                                                                             | **Never remove.** Squash only as a separate, tested change.                         |
| `backend/scripts/engage_load.py`                                                | Not imported by anything; a manual load tool cited in `docs/video-classrooms.md`.                                                                                                         | Keep. Needed for the Engage load test.                                              |
| `apps/learner-e2e/src/example.spec.ts`                                          | Generator placeholder. E2E is non-blocking in CI.                                                                                                                                         | Replace with a real smoke test against staging later.                               |
| `games/`, `rust/`, `mobile/`, `materials/`                                      | 83, 13, 39 and 75 tracked files. Not part of any Railway image (excluded by root directory or `.dockerignore`, once step 7.4 is done).                                                    | Keep. Only make sure they stay out of build contexts and watch patterns.            |
| `docker-compose.yml` (root)                                                     | In use for local full-stack runs and it is the only thing that exercises the frontend Docker targets today.                                                                               | Keep.                                                                               |
| `forge.settings_content`, `apps/mcp/tools/*`                                    | A naive search reports them as unreferenced. They are loaded by `DJANGO_SETTINGS_MODULE` and by `from .tools import ...` in `apps/mcp/server.py`.                                         | Keep. Listed so a later sweep does not flag them again.                             |

Not found, which is worth recording: no tracked `firebase.json`, `.firebaserc`,
`firestore.rules`, `storage.rules` or `capacitor.config.ts` on this branch; no
`firebase`, `@angular/fire` or `genkit` import in `apps/`, `libs/` or `backend/`; every
directory in `backend/apps/` is in `INSTALLED_APPS`, and every one with a `urls.py` is
routed (`audit` has models only, by design); no page component in the four apps is
missing from its routes.

## 16. Final phase: unit tests

Frameworks already in the repo: **pytest** with `pytest-django` for the backend
(`backend/tests/`, settings module `forge.settings_test`, real Postgres), **Jest** with
`jest-preset-angular` for the Angular apps and libraries (`*.spec.ts`, run by
`nx test <project>`), and `unittest` for `deploy/livekit/`. No new framework is needed.

Order: items marked **(with B/C)** merge with those phases, because they protect the
rollout. The rest follow the Phase G trim.

### 16.1 Backend, new files

**`backend/tests/test_settings_env.py`** (with B/C). `forge.settings` reads the
environment at import, so each case sets variables with `monkeypatch.setenv` and
re-imports the module with `importlib.reload` inside a helper, or runs
`python -c "import forge.settings"` in a subprocess for the cases that must raise.

- `DJANGO_SECRET_KEY` unset with debug off raises `RuntimeError`; with debug on it falls
  back to the development key.
- `env_bool` accepts `1`, `true`, `yes`, `on` in any case and nothing else; `env_list`
  trims and drops empty items.
- `RAILWAY_PUBLIC_DOMAIN` is appended to `ALLOWED_HOSTS`; `RAILWAY_ENVIRONMENT_NAME`
  adds `healthcheck.railway.app`; neither is added when unset.
- `DATABASE_URL` containing `:6543` or `pgbouncer=true` raises.
- With `DB_APP_PASSWORD` set, the database user and password are the runtime role's;
  with `DB_USE_OWNER=1` as well, they stay the owner's; with no password, the owner's.
- AWS path stays intact: no `DATABASE_URL` and `DB_HOST` set fills host, port, name,
  user, password and `sslmode=require`; `DATABASE_URL` wins when both are present.
- `FORGE_PUBLIC_URL` beats `RAILWAY_PUBLIC_DOMAIN`, which beats localhost; a trailing
  slash is stripped; `MCP_RESOURCE_URL` ends in `/mcp`.
- `FORGE_ROOT_DOMAIN=staging.soteriaforge.com` produces a CORS pattern that matches
  `https://lakewood.staging.soteriaforge.com` and rejects
  `https://lakewood.soteriaforge.com` and `https://evil-staging.soteriaforge.com.attacker.io`.
- `CORS_EXTRA_ORIGINS` and `CSRF_TRUSTED_ORIGINS` parse as lists.
- `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` are on with
  debug off; `SECURE_HSTS_SECONDS` defaults to 3600 and honours the variable.
- `BADGE_SIGNING_KEY` turns literal `\n` into newlines.
- Sentry: with `SENTRY_DSN` set, `init` is called with the environment from
  `FORGE_ENVIRONMENT`, else `RAILWAY_ENVIRONMENT_NAME`, and `send_default_pii=False`
  (patch `sentry_sdk.init`).
- If C4 adds an admin root setting: its pattern matches one label under the admin root
  and nothing else.

**`backend/tests/test_health.py`** (with B/C).

- `GET /healthz` returns 200 and `{"ok": true}`.
- It answers with a `Host` header that is not in `ALLOWED_HOSTS` (a private IP), which
  is the load balancer case, and with `Host: healthcheck.railway.app`.
- It answers over plain HTTP with `SECURE_SSL_REDIRECT` on (no 301), while another path
  on plain HTTP does redirect.
- It needs no token and sets no cookie.
- When the database cursor raises (patch `connection.cursor`), the response is a 5xx,
  not a 200.
- The same checks under `forge.settings_content` (`ROOT_URLCONF` override), so the
  content service's health check is covered.

**`backend/tests/test_storage_config.py`** (with B/C). `apps/standards/storage.py`, with
`boto3.client` patched so no network is used.

- `configured()` is false with nothing set; true with endpoint, bucket and both keys
  (Railway Bucket form); true with bucket and region only (S3 with a role); false with
  an endpoint but a missing key.
- `client()` passes the endpoint, path-style addressing, SigV4, the region and bounded
  timeouts in the Railway form, and passes no static credentials in the role form.
- `key_for` builds `standards/{tenant}/{package}/...` and rejects or normalises `..`,
  absolute paths and back-slashes.
- `local_root()` is honoured only in debug, never with debug off.
- `put`, `get` and `presigned_get` raise `StorageUnavailable` (a 503) when storage is not
  configured, rather than an unhandled error.
- `get` enforces its `limit`.

**`backend/tests/test_dispatch_migrations.py`** (with A). Uses
`django.db.migrations.executor.MigrationExecutor` and catalog queries.

- The loader's graph has `standards.0008_dispatches_rls` depending on `0007_dispatches`,
  and `0007` depending on the four migrations named in section 6.2. `0008` is a leaf.
- After migrating, `pg_class` shows `relrowsecurity` and `relforcerowsecurity` true for
  `standards_dispatch`, and `pg_policies` has `tenant_isolation` with both a `USING` and
  a `WITH CHECK` expression.
- Migrating `standards` back to `0006` removes the policy and the table; forward again
  restores both (run in a transaction-less test marked to restore state).
- After `ensure_app_role("forge_app")`, `has_table_privilege` is true for select,
  insert, update and delete on `standards_dispatch`, and the role is neither superuser
  nor `BYPASSRLS`.
- A guard for every later table: each model with a `tenant` foreign key in
  `INSTALLED_APPS` has a `tenant_isolation` policy and forced RLS. This catches the next
  "table shipped without its RLS migration" mistake, not only this one.

### 16.2 Backend, additions to existing files

| File                                 | Add                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/tests/test_rls.py`          | Using `use_app_role`: a `Dispatch` row of tenant A is invisible with tenant B set and with nothing set; inserting a row for tenant B while scoped to A fails `WITH CHECK`; moving a row to another tenant fails; `rls.bypass()` sees both.                                                                                                                                                                |
| `backend/tests/test_phase6.py`       | A member of another tenant gets 404 for `GET`, `PATCH`, `/package` and `/session` on a dispatch; a learner gets 403 on create; `lms_origins` rejects non-https origins outside debug and accepts localhost only in debug; the launch link uses `AUTH_LINK_BASE_URL` when set, the tenant's custom domain when it has one, else `<tenant>.<root>`; a revoked dispatch refuses the package and the session. |
| `backend/tests/test_cors.py`         | The staging root domain case; the content origin is never allowed; `x-experience-api-version` is in the allowed headers; the admin root from C4.                                                                                                                                                                                                                                                          |
| `backend/tests/test_auth_local.py`   | The refresh cookie is `Secure`, `HttpOnly`, path `/api/auth/`, `SameSite` from `AUTH_COOKIE_SAMESITE`, with no `Domain` attribute.                                                                                                                                                                                                                                                                        |
| `backend/tests/test_standards.py`    | Under `forge.settings_content` the URL configuration exposes only `healthz`, `runtime.js` and the two launch routes: `/api/`, `/admin/`, `/oauth/` and `/mcp` are 404.                                                                                                                                                                                                                                    |
| `backend/tests/test_mcp_platform.py` | With `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID` or `RAILWAY_SERVICE_ID` empty, the release tools return the "tools are off" message and make no HTTP call; `FORGE_STAGING_BRANCH` and `FORGE_PRODUCTION_BRANCH` overrides are used (covers D3).                                                                                                                                                            |
| `backend/tests/test_coach_smoke.py`  | With `COACH_ENABLED` off, coach endpoints answer as disabled and never open a connection to Ollama (the Railway state).                                                                                                                                                                                                                                                                                   |

Management commands (new `backend/tests/test_commands.py`): `ensure_app_role` raises
`CommandError` without `DB_APP_PASSWORD` and is idempotent when run twice; `seed_demo`
refuses to run with debug off; `process_scorm` and `forward_xapi` exit cleanly with
nothing to do, and `forward_xapi` fails with a clear error when the endpoint or
credentials are missing; `purge_coach_log` deletes only rows older than the retention
setting. Each command closes its database connection and returns, which Railway cron
requires.

### 16.3 Backend, paths touched by the trim

- **Removing `gunicorn`:** a test in `test_settings_env.py` that imports
  `forge.asgi.application` and that routes `/mcp` to the MCP app and `/healthz` to
  Django. That is the only entry point the image uses.
- **Removing Redis:** assert that importing settings with `REDIS_URL` unset and with it
  set gives the same configuration (no cache or channel layer appears), so removing the
  variable cannot change behaviour.
- **Folding `requests` into `httpx` (Tier 2):** extend
  `backend/tests/test_mcp_authoring.py` for `apps/assets/importer.py`: redirects are not
  followed, the connection goes to the address that was checked, private addresses are
  refused, and the 100 MB limit holds. Extend `test_mcp_platform.py` for the Railway and
  GitHub clients' timeout and non-200 handling.

### 16.4 Frontend (Jest)

| File                                                                                                                            | Add                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `libs/shared/src/lib/util/tenant-resolution.spec.ts`                                                                            | Root `staging.soteriaforge.com`: `lakewood.staging.soteriaforge.com` resolves to `lakewood`; `api.` and `app.` under it resolve to none; a `*.up.railway.app` host resolves to none; with D2 option A, `lakewood.admin.soteriaforge.com` against root `admin.soteriaforge.com` resolves to `lakewood`. |
| `libs/auth/src/lib/tenant.service.spec.ts`                                                                                      | The service uses `rootDomain` from the injected environment, not a constant.                                                                                                                                                                                                                           |
| `libs/auth` API interceptor spec (existing spec beside the interceptor)                                                         | Requests go to `apiBaseUrl` from the environment with no doubled slash, send credentials only to `/api/auth/` and attach the bearer token only to the API origin.                                                                                                                                      |
| `scripts/forge-env.spec.ts` (new, run by the `shared` Jest project or `node --test`)                                            | The script from step C2: writes the file when `FORGE_API_BASE_URL` is set without `VERCEL`; strips trailing slashes; defaults `rootDomain`; exits non-zero on Vercel when the variable is missing; leaves the committed file alone when nothing is set.                                                |
| `apps/learner/src/app/pages/dispatch/dispatch.component.spec.ts`, `dispatch-reporter.service.spec.ts` (exist, untracked today)  | Commit them. Add: progress is posted only to an origin in `lms_origins`; a revoked dispatch shows the inactive-link message; an unenrolled learner sees the ask-your-instructor message.                                                                                                               |
| `libs/standards/src/lib/standards-api.spec.ts`, `apps/admin/src/app/pages/analytics.component.spec.ts` (exist, untracked today) | Commit them with Phase 6. Add the dispatch list, create, patch and revoke calls against the shapes in `backend/openapi.json`.                                                                                                                                                                          |
| `libs/shared/src/lib/schemas/learning-contract.spec.ts`                                                                         | Extend the contract test to the dispatch and analytics responses, so a stale `openapi.json` fails here as well as in CI.                                                                                                                                                                               |
| `apps/learner/src/app/app.component.spec.ts`                                                                                    | After the `OfflineXapiQueue` trim: the offline banner reflects the quiz and completion outboxes and the app boots without the queue provider.                                                                                                                                                          |
| Each library `index.ts` touched by Tier 2                                                                                       | No new test. `nx run-many -t build lint test` is the gate: a removed export that is still used fails the build.                                                                                                                                                                                        |
| `apps/*/src/app/app.routes.spec.ts` (add where missing)                                                                         | Every lazy route resolves its component. This is the check that a trimmed component was not still routed.                                                                                                                                                                                              |

Specs that go away with their code in Tier 2 (delete together, never orphan them):
`libs/player/**/*.spec.ts`, the four `libs/games` component specs, `scorm-player`,
`manifest` and `offline-xapi-queue` specs in `libs/standards`, `course.store` and
`progress` specs in `libs/lms-core`, `xp.service`, `leaderboard` and `xp-badge` specs in
`libs/gamification`, `quiz-grading` and `vector` specs in `libs/shared`, and the four
`libs/ui` component specs. After the trim, check that Jest coverage thresholds (if any
are configured per project) still pass.

### 16.5 Deploy files

- `deploy/livekit/test_configure.py` already covers the LiveKit generator. No change.
- New CI `docker` job (section 10) is the test for both Dockerfiles. Add one assertion
  step: run the built API image with `DJANGO_SECRET_KEY` set and
  `python manage.py check --deploy`, and fail on any warning that is not already
  silenced in settings.

### 16.6 Done means

`npx nx run-many -t lint test build` and `cd backend && uv run pytest` are green on the
release branch; the new `docker` CI job is green; and each test above fails when the
thing it guards is broken (check that once by hand for the settings, health, storage and
migration tests, since those are the ones standing between a bad variable and
production).
