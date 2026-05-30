# Security

## Reporting a vulnerability

Email **security@trainovations.com** with details and reproduction steps. Do not
open public issues for security reports. We aim to acknowledge within 2 business
days.

## Security model (summary)

Soteria FORGE is multi-tenant; **tenant isolation** is the central invariant.

### Identity & tenancy

- **GCIP true multi-tenancy** — each tenant is a first-class Identity Platform
  tenant; users authenticate against their tenant pool. Superadmin authenticates
  against the project-level pool.
- **Custom claims** (`role`, `tenantId`, `entitlements`) are set **only** by
  Cloud Functions (Admin SDK), never by clients.

### Authorization (defense in depth)

1. **Firestore/Storage security rules** — the authoritative layer. Default-deny;
   reads/writes are tenant-scoped; privileged surfaces (claims, leaderboard,
   vectors, LRS, audit, Stripe log) are server-only. Verified by **40 emulator
   rules tests** (`nx test-rules data-access`).
2. **Cloud Functions** — validate the caller's claims on every privileged call;
   the server is authoritative for scores (anti-cheat), entitlements, XP, and AI
   retrieval scope.
3. **Client route guards** — convenience layer (`authGuard`, `roleGuard`,
   `tenantGuard`, `superadminGuard`, `entitlementGuard`); never the sole control.

### Tenant isolation guarantees

- **Data**: every tenant document is path- and field-scoped by `tenantId`; no
  client query crosses tenants (rules-enforced).
- **AI tutor**: retrieval reads only `tenants/{t}/vectors`; the caller's tenant
  claim is authoritative — no cross-tenant grounding.
- **External content (Unity/cmi5)**: the AU's xAPI auth token is an HMAC-signed,
  tenant-scoped token; statements are stamped with the token's tenant, so an AU
  cannot post into another tenant (unit-tested).

### Money & credentials

- **Entitlements** are granted **only** by the signature-verified Stripe webhook
  (idempotent via `stripeEvents/{id}`); client payment state is never trusted.
- **Secrets** live in Secret Manager (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `CMI5_SIGNING_SECRET`); never committed.
- **App Check** attests client traffic to Firestore/Functions/Storage.

### Auditing & compliance

- Append-only **audit log** of privileged actions (`tenants/{t}/audit`,
  `platform/auditLog`), server-written.
- **GDPR/CCPA**: `exportUserData` (portability) and `deleteUserData`
  (right-to-erasure; superadmin + explicit confirm). See `docs/compliance.md`.

## Pre-deployment security checklist

- [ ] App Check enforced (reCAPTCHA Enterprise site key set) on Firestore,
      Functions, Storage.
- [ ] Secrets set in Secret Manager; none in source or env files.
- [ ] Stripe webhook endpoint uses the live signing secret; idempotency verified.
- [ ] `CMI5_SIGNING_SECRET` is a strong random value, rotated periodically.
- [ ] Rules tests green in CI; manual cross-tenant probe fails.
- [ ] Separate Firebase projects per environment (dev/staging/prod).
- [ ] Storage objects served via short-lived signed URLs; buckets not public
      except `b2c/public`.
- [ ] Dependency scanning + `npm audit` in CI; Dependabot enabled.
- [ ] SOC 2 / FedRAMP-adjacent controls reviewed for GovCon tenants.
