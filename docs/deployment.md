# Deployment runbook

Clean split: **Vercel** hosts the Angular apps (incl. storefront SSR/edge);
**Firebase/GCP** hosts data, auth, business logic, and AI.

## Environments

Separate Firebase projects per environment (see `.firebaserc`):
`soteria-forge-dev` · `soteria-forge-staging` · `soteria-forge-prod`.

## One-time setup

1. **Firebase/GCIP**: enable Identity Platform (multi-tenancy), Firestore
   (+ vector indexes), Cloud Functions (2nd gen), Storage, App Check
   (reCAPTCHA Enterprise), FCM.
2. **Secrets** (Secret Manager): `firebase functions:secrets:set <NAME>` for
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CMI5_SIGNING_SECRET`. Set
   params `STOREFRONT_URL`, `FUNCTIONS_BASE_URL`.
3. **Stripe**: create products/prices; add the webhook endpoint
   (`/stripeWebhook`) with the signing secret; map prices into `/catalog`.
4. **Vector store / LLM** (Phase 6): enable Vertex AI on the project, then set
   `FORGE_AI_PROVIDER=vertex` (optional `VERTEX_LOCATION`) on the functions to
   switch `getProviders()` from the local default to the Vertex adapter
   (Gemini 1.5 Pro + text-embedding-004). No code change required.
5. **Video** (Phase 2): configure Mux (or Cloudflare Stream) if used beyond
   linked video.
6. **Open Badges 3.0**: provision the issuer key (Ed25519) + hosted issuer
   profile (see `docs/open-badges.md`).
7. **DNS**: wildcard `*.soteriaforge.com` → the learner/admin apps; apex + `www`
   → the storefront. Per-tenant custom domains map via
   `ForgeEnvironment.customDomains`.

## Deploy

- **Firebase** (rules, indexes, functions, storage): `firebase deploy` (per
  alias: `firebase use staging && firebase deploy`). Rules + indexes deploy with
  `firebase deploy --only firestore`.
- **Vercel**: each Angular app is a Vercel project (`vercel.json` for the
  storefront SSR). Push to `main` triggers production; PRs get preview deploys.
- **Env config**: per-app `.env` (see `.env.example`) carries the public Firebase
  web config + `rootDomain` + App Check site key.

## CI/CD

- CI (`.github/workflows/ci.yml`): `format`, `lint`, `test`, per-project `build`
  matrix, `rules-tests` (Firestore emulator), and `e2e` (Playwright, non-blocking
  until browsers/served app are wired).
- On merge to `main`: deploy Firebase (functions/rules/indexes) and trigger
  Vercel production deploys. (Add deploy jobs with project-scoped service-account
  / Vercel tokens in repo secrets.)

## Provisioning a tenant

See `docs/tenant-provisioning-runbook.md`.
