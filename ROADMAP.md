# Soteria FORGE — Completion Roadmap

A phased plan to take the platform from the current Phase 0 foundation to a launched,
production-grade multi-tenant LMS (B2B + B2C).

## Current state (as of this writing)

- Nx 20 workspace config, Angular 20 / PrimeNG 19 / AngularFire / NgRx Signals dependency set.
- `libs/shared`: Zod schemas for tenancy, identity (custom claims), courses/modules/enrollments,
  commerce (Stripe catalog/customers/webhook log), gamification (badges, leaderboards), plus
  platform constants (roles, content types, xAPI verbs).
- Nothing else: no apps, no other libs, no Firebase config, no Cloud Functions, no security
  rules, no CI, no tests.

Target architecture (already encoded in `tsconfig.base.json` paths and `package.json` scripts):

| Apps                           | Libs                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `learner` (B2B learner portal) | `shared`, `auth`, `data-access`, `ui`, `lms-core`      |
| `admin` (tenant admin)         | `standards` (SCORM/cmi5/xAPI), `games`, `gamification` |
| `superadmin` (platform ops)    | `payments`, `ai-tutor`                                 |
| `storefront` (public B2C)      |                                                        |

---

## Phase 0 (finish) — Workspace foundation ✅ DONE

Goal: `npm install && npm run lint && npm test && npm run build` all green in CI.

- Complete `libs/shared`: barrel `src/index.ts`, `jest.config.ts`, `tsconfig.json`/`tsconfig.lib.json`/`tsconfig.spec.json`, `eslint.config.mjs`; unit tests for every schema (valid/invalid fixtures).
- Root tooling referenced but missing: `jest.preset.js`, root `eslint.config.mjs` with Nx module-boundary rules enforcing the `scope:`/`type:` tag conventions.
- Firebase scaffolding: `firebase.json` (hosting targets per app, emulators), `.firebaserc`, empty-but-valid `firestore.rules`, `storage.rules`, `firestore.indexes.json`.
- Generate the 4 app shells (`nx g @nx/angular:application`) and remaining lib skeletons so paths resolve.
- GitHub Actions CI: `nx affected -t lint,test,build` on PRs; emulator-backed rules tests job.
- `README.md` (setup, emulator workflow, conventions) and a `CLAUDE.md`/`docs/architecture.md`.

Exit criteria: CI green, all apps serve a hello-world shell, emulators boot.

## Phase 1 — Identity, tenancy, and data access (the platform spine) ✅ DONE

Everything else depends on this; do it before any feature UI.

- **`libs/auth`**: AngularFire auth service, GCIP multi-tenant sign-in (tenant resolved from subdomain → `gcipTenantId`), `Principal` store (NgRx Signals), route guards by role (`superadmin`, `tenant_admin`, `instructor`, `learner`, `b2c_customer`).
- **`apps/functions`** (add an Nx node project + `@nx/esbuild`): callable `setUserRole` / `inviteMember` (claim-setters — clients never write claims), `onUserCreate` provisioning, tenant provisioning flow (create tenant doc + GCIP tenant + admin member).
- **Firestore security rules** for `/tenants/{id}` and `/tenants/{id}/members/{uid}`: tenant isolation via `request.auth.token.tenantId`, role checks mirroring `ROLES`/`AUTHORING_ROLES`. Rules unit tests with `@firebase/rules-unit-testing` (`npm run test:rules` already exists as a script).
- **`libs/data-access`**: generic typed repository — Firestore converters that parse through the Zod schemas on read/write, tenant-scoped collection helpers, pagination.
- **Tenant resolution + white-labeling**: subdomain → tenant lookup (respect `RESERVED_SUBDOMAINS`), theming service mapping `branding.colors` to CSS custom properties, PrimeNG theme preset in **`libs/ui`** plus shared shell/layout components.

Exit criteria: a user can sign in to a tenant subdomain, sees tenant branding, rules tests prove cross-tenant reads are denied.

## Phase 2 — LMS core (B2B MVP — first sellable slice) ✅ DONE (journey e2e pending)

- **`apps/admin`**: member management (invite → email → accept flow, statuses `invited/active/deactivated`), content upload to Storage (video first), publish workflow (`draft/published/archived`).
- **Forge Studio** (started early, ahead of the backend): Articulate-Rise-style block course
  builder — 15 block types (text, media, accordion/tabs/flashcards, knowledge checks),
  three-pane editor with drag-and-drop, undo/redo, debounced autosave, and a pixel-identical
  learner preview via the shared `ForgeLessonRenderer` in `libs/lms-core`. Persistence sits
  behind `CourseRepository` (localStorage now; the Firestore implementation replaces it here
  in Phase 2 without builder changes).
- **`apps/learner`**: course catalog (published only), enrollment, course player shell, video module playback with `minProgressPct` completion, progress + `lastActivityAt` written to the enrollment doc.
- **`libs/lms-core`**: enrollment/progress domain services shared by both apps.
- Functions: enrollment-completion trigger (sets `completed`, stamps score), transactional progress aggregation.
- Storage rules: tenant-scoped asset paths; signed-URL or rules-gated playback.
- Playwright e2e: admin authors a course → learner completes it.

Exit criteria: end-to-end author→learn→complete loop works on emulators and a staging Firebase project.

## Phase 3 — Standards & content runtimes (`libs/standards`, `libs/games`) 🔨 IN PROGRESS (SCORM, xAPI/LRS, quiz engine done; cmi5 + game embed wrappers pending)

- SCORM 1.2/2004 runtime adapter: API discovery shim in the player iframe, `cmi` state persisted per enrollment (schema field already exists), package upload/unzip pipeline (function) for admin.
- cmi5/xAPI: statement builder using `XAPI_VERBS` + the tenant context extension; LRS endpoint as an HTTP function (or adapter to an external LRS) with statement storage and basic queries.
- Quiz engine: authoring (admin) + player (learner) for the six `QUESTION_TYPES`, scoring against `completion.minScore`.
- `libs/games`: embed wrappers for Phaser/Pixi/Rive and a Unity WebGL loader, with a postMessage bridge that emits xAPI/score events into the same progress pipeline.

Exit criteria: a SCORM package and a quiz both drive enrollment completion; xAPI statements recorded with tenant scoping.

## Phase 4 — Gamification (`libs/gamification`, `libs/games`)

- XP/level engine: function triggers on module/course completion award `xpReward`, update member `xp`/`level`/`streakDays` transactionally.
- Badges: admin badge CRUD, award on completion via `badgeRefs`, Open Badges 3.0 verifiable-credential issuing + public verification endpoint.
- Leaderboards: scheduled function aggregates `daily/weekly/allTime` into the denormalized leaderboard docs; learner UI for profile, badge wall, leaderboards, streaks.
- **Hazard Hunter** (Three.js + Phaser): first-person, turn-based hazard hunt. Level 1 is a
  warehouse, level 2 a tool shop, each seeded with OSHA-violation hazards. Identifying a hazard
  shows the incident it could have caused and the OSHA regulation violated; hazards missed when
  the shift ends play out as incident reports.
- **PERIL!** (Phaser): Jeopardy-style workplace-safety game show — full TV rules (two rounds,
  Daily Doubles, Final PERIL wagering), board styling, synthesized sound effects. Multiplayer
  via a pluggable opponent provider: Firestore realtime matches against other users in the
  system, falling back to novice AI contestants (who buzz slowly and miss often) when no
  human opponents are available.

Exit criteria: completing content visibly moves XP, badges, and leaderboard rank; both games
playable from the learner app and feeding score/completion into the progress pipeline.

## Phase 5 — B2C commerce (`apps/storefront`, `libs/payments`)

- Storefront: public catalog from `/b2c/catalog`, SSR-enabled for SEO (`@angular/ssr` is already a dependency), Stripe Checkout (one-time + subscription per `mode`).
- Functions: Stripe webhook handler with idempotency via `/stripe/events`, entitlement writes to `/b2c/customers/{uid}` mirrored into custom claims (`entitlements`), subscription lifecycle (cancel/expire revokes).
- Entitlement-gated learner experience for `b2c_customer` under the reserved `b2c` tenant; superadmin authoring of catalog products.

Exit criteria: test-mode purchase grants access within seconds; webhook replay is a no-op.

## Phase 6 — Superadmin & platform ops (`apps/superadmin`)

- Tenant lifecycle UI: provision/suspend/archive, plan assignment, custom-domain mapping.
- Global course library (`sourceLibraryId`): superadmin-authored courses shareable into tenants.
- Cross-tenant analytics dashboards, support tooling (audited impersonation), B2C catalog management.

## Phase 7 — AI tutor (`libs/ai-tutor`)

- Conversational tutor grounded on the enrolled course's content, exposed in the learner player; instructor-side aids (quiz/question generation from module content). Served via a Cloud Function proxy (API keys server-side only), per-tenant enable flag and usage metering.

## Phase 8 — Hardening & launch

- Firebase App Check, Firestore backups/PITR, budget alerts, monitoring + alerting (Cloud Logging/Error Reporting), rate limiting on callables.
- Accessibility (WCAG 2.1 AA) and performance passes; full Playwright regression suite across all four apps; load test of rules-heavy reads.
- Custom-domain automation, per-environment config (dev/staging/prod Firebase projects), versioned release process.

---

## Cross-cutting rules (every phase)

1. Security rules and rules tests land **in the same PR** as any new collection.
2. All Firestore I/O goes through `libs/data-access` Zod converters — no raw `setDoc` in apps.
3. Custom claims are only ever written by Cloud Functions.
4. CI must stay green; `nx affected` gates lint/test/build on every PR.

## Suggested sequencing

Phases 0–2 are strictly sequential (each is the foundation of the next). Phases 3 and 4 can
proceed in parallel after 2. Phase 5 needs 2 (content to sell) but not 3/4. Phases 6–8 close
out the platform. The first revenue-capable milestone is end of Phase 2 (B2B) or Phase 5 (B2C).
