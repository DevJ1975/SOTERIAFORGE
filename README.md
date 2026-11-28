# Soteria Assurance

Production-grade, multi-tenant Learning Management System (LMS) for the Soteria
training ecosystem. Delivers compliance and skills training via video,
interactive quizzes, card-game learning, and gamification, with a per-tenant RAG
AI tutor. Serves **B2B multi-tenant** (white-labeled, isolated tenants) and a
public **course catalog** storefront with a request-access path.

## Locked architecture decisions (Phase 0)

| Decision                 | Choice                                                          |
| ------------------------ | --------------------------------------------------------------- |
| Multi-tenancy & identity | **Django** — shared schema, tenant-scoped rows, Postgres RLS    |
| UI component library     | **PrimeNG** (wrapped by `@assurance/ui` design system)          |
| App layout               | **Four separate apps** — learner, admin, superadmin, storefront |
| Tenant routing           | **Subdomain** (`acme.soteriaforge.com`); catalog on the apex    |

See [`docs/adr/0001-phase0-decisions.md`](docs/adr/0001-phase0-decisions.md).
Deferred decisions (LRS, vector store, LLM provider, video platform) carry the
spec's recommended defaults and are revisited in their phases.

## Tech stack

- **Frontend:** Angular 22 (standalone, signals, new control flow, `@defer`,
  SSR for storefront), Nx monorepo, NgRx SignalStore, PrimeNG, PWA.
- **Backend/data:** Django 6 + DRF on Railway, Postgres (+ pgvector),
  S3-compatible bucket for media. See `backend/`.
- **Standards:** SCORM 1.2/2004 (`scorm-again`), xAPI, cmi5, Open Badges 3.0.
- **AI:** course tutor on Django (pgvector retrieval), per-tenant isolated sources.
- **Interactive:** Rive, Phaser/PixiJS, Unity WebGL via cmi5.
- **Hosting:** Railway (Angular apps, Django API, SCORM content origin, Postgres,
  bucket); see `docs/railway-go-live-plan.md`. AWS (`infra/aws/`) is next.

## Workspace layout

```
apps/        learner · admin · superadmin · storefront (SSR)
backend/     Django API (uv, pytest, ruff)
libs/        ui · auth · lms-core · standards · gamification
             ai-tutor · games · player · shared
docs/        data model, index manifest, runbooks, Unity contract, ADRs
```

Path aliases: `@assurance/<lib>` (see `tsconfig.base.json`).

## Getting started

```bash
npm install                 # installs with legacy-peer-deps (see .npmrc)
npm run start:learner       # serve the learner PWA
npm test                    # run all unit tests (Nx)
npm run lint                # lint all projects
```

The only frontend setting is `FORGE_API_BASE_URL` (the Django API's public URL),
read at image build time by `scripts/forge-env.mjs`; see `.env.example`. Local builds use
the committed `environment*.ts` files (`http://localhost:8000` in development).
Backend settings live in `backend/.env.example`; secrets are never committed.

## Run with Docker

Build and start all four frontend apps:

```bash
docker compose up --build
```

Open the learner app at `http://localhost:8080`, admin at
`http://localhost:8081`, superadmin at `http://localhost:8082`, and the
server-rendered storefront at `http://localhost:8083`. The learner, admin, and
superadmin apps are served by Nginx; the storefront runs on Node.js. Stop the
containers with `docker compose down`.

The frontend environment (API URL, root domain) is compiled into each Angular app during
the image build; setting container environment variables does not override it. Pass
`--build-arg FORGE_API_BASE_URL=... --build-arg FORGE_ROOT_DOMAIN=...` to point a build
elsewhere; without them the committed environment files are used. The API's local
Postgres Compose stack remains in `backend/docker-compose.yml`.
The storefront SSR host allowlist defaults to `localhost,127.0.0.1`; set
`NG_ALLOWED_HOSTS` in the Compose environment to a comma-separated list of
hostnames (for example, `soteriaforge.com,*.soteriaforge.com`) when using
different domains.

## Build roadmap

10 phases (0–9): Foundation → Multi-tenant core → Content & delivery →
Standards engine → Quizzes & gamification → Interactive games → AI tutor →
Public catalog → Unity contract → Hardening. Each ships as a tested vertical slice.

## Security model (summary)

- Tenant isolation enforced authoritatively by the Django API (tenant-scoped
  querysets plus Postgres row-level security); client guards are a convenience layer.
- Roles and tenant membership live in Postgres and change only through the API,
  never the client.
- AI retrieval is **hard-filtered by tenant** — no cross-tenant leakage.
- WCAG 2.1 AA is a compliance-grade goal.
