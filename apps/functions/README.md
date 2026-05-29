# @forge/functions

Firebase Cloud Functions (2nd gen) — the privileged backend. The Admin SDK
bypasses security rules, so all claim-bearing and money-touching operations live
here behind explicit authorization checks.

## Functions

| Export            | Type     | Purpose                                                                                                       |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `provisionTenant` | callable | Superadmin-only. Creates a GCIP Identity Platform tenant, seeds the `/tenants/{id}` doc + leaderboard config. |
| `setMemberRole`   | callable | Sets a member's role + custom claims (GCIP tenant-aware). Superadmin, or tenant_admin within own tenant.      |
| `stripeWebhook`   | https    | Signature-verified Stripe events. Grants entitlements idempotently (never trusts the client).                 |
| `ingestStatement` | callable | Appends a tenant-tagged xAPI statement (Firestore LRS v1).                                                    |
| `askTutor`        | callable | Per-tenant RAG tutor; retrieval is tenant-isolated (LLM wired in Phase 6).                                    |

## Build & deploy

- Bundled with esbuild (`nx build functions`) → `lib/index.js`; npm deps stay
  external and are declared in this app's `package.json`.
- Typecheck: `nx typecheck functions` (tsc `--noEmit`, resolves workspace paths).
- Deploy: `firebase deploy --only functions` (predeploy builds).

## Secrets (Secret Manager — never commit)

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

Set via `firebase functions:secrets:set STRIPE_SECRET_KEY`.
