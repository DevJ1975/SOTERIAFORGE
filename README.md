# Soteria FORGE

Production-grade, multi-tenant LMS (B2B + B2C) built on Angular 20, Nx, Firebase, and PrimeNG.
See [ROADMAP.md](./ROADMAP.md) for the phased delivery plan.

## Workspace layout

| Project               | Path                | Purpose                                                                   |
| --------------------- | ------------------- | ------------------------------------------------------------------------- |
| `learner`             | `apps/learner`      | B2B learner portal (tenant subdomains)                                    |
| `admin`               | `apps/admin`        | Tenant admin: members, authoring, publishing                              |
| `superadmin`          | `apps/superadmin`   | Platform ops: tenants, global library, B2C catalog                        |
| `storefront`          | `apps/storefront`   | Public B2C storefront (Stripe)                                            |
| `@forge/shared`       | `libs/shared`       | Zod schemas + platform constants (single source of truth for data shapes) |
| `@forge/auth`         | `libs/auth`         | GCIP multi-tenant auth, guards, principal store                           |
| `@forge/data-access`  | `libs/data-access`  | Typed, Zod-validated Firestore repositories                               |
| `@forge/ui`           | `libs/ui`           | PrimeNG theme + shared shell/layout components                            |
| `@forge/lms-core`     | `libs/lms-core`     | Course/enrollment/progress domain services                                |
| `@forge/standards`    | `libs/standards`    | SCORM, cmi5, xAPI runtimes (framework-agnostic)                           |
| `@forge/games`        | `libs/games`        | Phaser/Pixi/Rive/Unity embed wrappers                                     |
| `@forge/gamification` | `libs/gamification` | XP, badges (Open Badges 3.0), leaderboards                                |
| `@forge/payments`     | `libs/payments`     | Stripe checkout + entitlements (client side)                              |
| `@forge/ai-tutor`     | `libs/ai-tutor`     | AI tutor UI + client                                                      |

## Getting started

```sh
npm install
npm run start:learner      # or start:admin / start:superadmin / start:storefront
```

Useful targets:

```sh
npm run lint               # lint all projects
npm test                   # unit tests for all projects
npm run build              # build all apps
npx nx affected -t lint test build   # only what changed
npm run emulators          # Firebase emulator suite (requires Java)
```

## Conventions

- **Data shapes** live in `@forge/shared` as Zod schemas. All Firestore I/O must go through
  the converters in `@forge/data-access` — no raw `setDoc`/`getDoc` in apps.
- **Security rules** (`firestore.rules`, `storage.rules`) are deny-by-default. Any PR that adds
  a collection must open it up explicitly and ship rules unit tests in the same PR.
- **Custom claims** (`role`, `tenantId`, `entitlements`) are written only by Cloud Functions.
- **Module boundaries** are enforced by `@nx/enforce-module-boundaries` using `scope:`/`type:`
  tags in each `project.json` (see `eslint.config.mjs` for the dependency matrix).
- Formatting is Prettier via `npx nx format:write`; CI runs `format:check`.

## Firebase

`firebase.json` defines four hosting targets (one per app) and the emulator suite.
`.firebaserc` maps them to hosting sites of the active project — update the project ids
when real Firebase projects are provisioned (dev/staging/prod planned; see ROADMAP.md
Phase 8).
