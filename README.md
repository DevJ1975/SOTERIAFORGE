# Soteria FORGE

Production-grade, multi-tenant LMS (B2B + B2C) built on Angular 20, Nx, Firebase, and PrimeNG,
styled end to end with the Adobe Spectrum design system.
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
| `@forge/games`        | `libs/games`        | Safety Arcade: Hazard Hunter (Three.js + Phaser) and PERIL! (Phaser)      |
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
- **Design system**: Adobe Spectrum materials and components, skinned with the Soteria
  Forge brand (Ember `#E8551F` / Charcoal `#1B1E23`, Oswald display + Barlow Semi Condensed
  UI type). Tokens live in `libs/ui/src/lib/theme/spectrum.scss` (`--forge-*` aliases over
  `--sf-*` brand globals); PrimeNG is themed via `ForgePreset`
  (`libs/ui/src/lib/theme/forge-preset.ts`). Never hardcode colors — consume the tokens.

## Auth & emulators (Phase 1)

There is no real Firebase project yet — the apps run against the **emulator suite**
(`npm run emulators`; requires Java). On `localhost` the apps auto-connect to the Auth
(:9099) and Firestore (:8080) emulators with the demo project `soteria-forge-dev`; the
login screen offers a create-account mode there (any email/password makes a test user).
Tenancy is resolved from the subdomain (`acme.soteriaforge.com` → tenant `acme`), with a
`?tenant=` query override for local development. Custom claims (`role`, `tenantId`,
`entitlements`) are set only by the Cloud Functions in `apps/functions`
(`setUserRole`, `inviteMember`, `provisionTenant`, plus a member-claims sync trigger).

Security rules tests run against the emulator:

```sh
npm run test:rules        # or: npx firebase emulators:exec --only firestore                           #     --project demo-rules-test "npx nx test data-access --testPathPattern=rules"
```

Note: the B2C collections live under the singleton document `/b2c/store`
(`/b2c/store/catalog/{productId}`, `/b2c/store/customers/{uid}`).

## Firebase

`firebase.json` defines four hosting targets (one per app), the Cloud Functions codebase
(deployed from `dist/apps/functions`), and the emulator suite.
`.firebaserc` maps them to hosting sites of the active project — update the project ids
when real Firebase projects are provisioned (dev/staging/prod planned; see ROADMAP.md
Phase 8).
