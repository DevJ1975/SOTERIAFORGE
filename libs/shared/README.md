# @assurance/shared

Cross-cutting types, zod schemas, constants, and pure utilities for Soteria Assurance.
Has **no Angular dependency** in its schemas so it is safe to import from any app and
SSR/edge runtimes.

## Contents

- `constants.ts` — roles, content types, statuses, xAPI verbs, the B2C tenant id,
  reserved subdomains. Keep aligned with the Django API.
- `schemas/` — the platform data model as zod schemas (API wire shapes) with
  inferred TypeScript types:
  - `identity` — custom claims, principal
  - `tenant` — tenant, member, branding, theme
  - `course` — course, module, enrollment
  - `quiz` — quiz, questions, game config
  - `gamification` — badge, leaderboard
  - `xapi` — xAPI statement (LRS)
  - `ai` — knowledge source, vector chunk, chat message
- `util/`
  - `tenant-resolution.ts` — pure host → tenant resolver (subdomain strategy)
  - `validation.ts` — `parseOrThrow` / `tryParse` trust-boundary helpers

## Conventions

- Validate untrusted data at every trust boundary with `parseOrThrow`.
- Every tenant-scoped document carries a `tenantId`; never query across tenants
  client-side.
- Timestamps cross the boundary as ISO-8601 strings.
