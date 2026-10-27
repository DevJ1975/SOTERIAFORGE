# Soteria Assurance

Production-grade, multi-tenant Learning Management System (LMS) for the Soteria
training ecosystem. Delivers compliance and skills training via video,
interactive quizzes, card-game learning, and gamification, with a per-tenant RAG
AI tutor. Serves **B2B multi-tenant** (white-labeled, isolated tenants) and a
**B2C storefront** (Stripe-gated à-la-carte / subscription) simultaneously.

## Locked architecture decisions (Phase 0)

| Decision                 | Choice                                                          |
| ------------------------ | --------------------------------------------------------------- |
| Multi-tenancy & identity | **GCIP true multi-tenancy** (Identity Platform tenants)         |
| UI component library     | **PrimeNG** (wrapped by `@assurance/ui` design system)          |
| App layout               | **Four separate apps** — learner, admin, superadmin, storefront |
| Tenant routing           | **Subdomain** (`acme.soteriaforge.com`); B2C on the apex        |

See [`docs/adr/0001-phase0-decisions.md`](docs/adr/0001-phase0-decisions.md).
Deferred decisions (LRS, vector store, LLM provider, video platform) carry the
spec's recommended defaults and are revisited in their phases.

## Tech stack

- **Frontend:** Angular 20 (standalone, signals, new control flow, `@defer`,
  SSR for storefront), Nx monorepo, NgRx SignalStore, PrimeNG, PWA.
- **Backend/data:** Firebase — GCIP Auth, Cloud Firestore (+ vector search),
  Cloud Functions (2nd gen), Cloud Storage, App Check, FCM, Security Rules.
- **Standards:** SCORM 1.2/2004 (`scorm-again`), xAPI, cmi5, Open Badges 3.0.
- **AI:** Firebase Genkit RAG, per-tenant isolated retrieval.
- **Payments:** Stripe Checkout/Billing (webhook-granted entitlements).
- **Interactive:** Rive, Phaser/PixiJS, Unity WebGL via cmi5.
- **Hosting:** Vercel (Angular SSR/edge) + Firebase (data/auth/logic/AI).

## Workspace layout

```
apps/        learner · admin · superadmin · storefront (SSR) · functions (backend)
libs/        ui · auth · data-access · lms-core · standards · gamification
             ai-tutor · games · payments · shared
docs/        data model, index manifest, runbooks, Unity contract, ADRs
```

Path aliases: `@assurance/<lib>` (see `tsconfig.base.json`).

## Getting started

```bash
npm install                 # installs with legacy-peer-deps (see .npmrc)
npm run emulators           # Firebase emulator suite (auth/firestore/functions/storage)
npm run start:learner       # serve the learner PWA
npm test                    # run all unit tests (Nx)
npm run lint                # lint all projects
```

Copy `.env.example` → `.env` per app and fill Firebase web config. Backend
secrets (Stripe, etc.) live in Secret Manager — never commit them.

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

The frontend Firebase configuration is compiled into each Angular app during
the image build; setting container environment variables does not override it.
Configure the apps' production environment files before building. The API's
local Postgres/Redis Compose stack remains in `backend/docker-compose.yml`.
The storefront SSR host allowlist defaults to `localhost,127.0.0.1`; set
`NG_ALLOWED_HOSTS` in the Compose environment to a comma-separated list of
hostnames (for example, `soteriaforge.com,*.soteriaforge.com`) when using
different domains.

## Build roadmap

10 phases (0–9): Foundation → Multi-tenant core → Content & delivery →
Standards engine → Quizzes & gamification → Interactive games → AI tutor →
B2C + Stripe → Unity contract → Hardening. Each ships as a tested vertical slice.

## Security model (summary)

- Tenant isolation enforced authoritatively in **Firestore/Storage rules**;
  client guards are a convenience layer.
- Custom claims (`role`, `tenantId`, `entitlements`) are set **only** by Cloud
  Functions, never the client.
- Entitlements granted **only** on verified Stripe webhooks.
- AI retrieval is **hard-filtered by tenant** — no cross-tenant leakage.
- App Check attests all client traffic. WCAG 2.1 AA is a compliance-grade goal.
