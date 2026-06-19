# Security Policy

Soteria FORGE is a multi-tenant learning management system built on Firebase /
Google Cloud. This document describes how to report vulnerabilities, which
versions are supported, and the security architecture of the platform.

> **SOC 2 status:** Soteria FORGE is actively working toward SOC 2 Type II
> readiness. The technical controls described below are implemented, but the
> platform has **not yet completed a SOC 2 audit and is not attested**. Do not
> represent it as SOC 2 certified. This document is an honest snapshot of
> in-progress controls, not a compliance claim.

## Reporting a vulnerability

Please report suspected security issues **privately** — do not open a public
GitHub issue, pull request, or discussion for a vulnerability.

- **Email:** security@trainovations.com
- **Subject:** `[SECURITY] <short summary>`
- Include: affected component / URL, reproduction steps or PoC, impact, and any
  relevant logs (with secrets redacted).

What to expect:

| Stage                  | Target                                        |
| ---------------------- | --------------------------------------------- |
| Acknowledgement        | within **3 business days**                    |
| Triage & severity      | within **7 business days**                    |
| Fix / mitigation plan  | communicated after triage, severity-dependent |
| Coordinated disclosure | by mutual agreement once a fix is available   |

We support coordinated disclosure and will credit reporters who wish to be
named. Please give us a reasonable window to remediate before public disclosure.
Do not access, modify, or exfiltrate data that is not yours, and do not run
denial-of-service or automated load tests against production.

## Supported versions

The platform is delivered as a continuously deployed monorepo rather than
discrete numbered releases. Security fixes are applied to:

| Version                     | Supported |
| --------------------------- | --------- |
| `main` (current production) | ✅        |
| Previous deployed revisions | ❌        |

Only the latest `main` is patched. There is no long-term support branch.

## Security architecture overview

### Tenant isolation

- The platform is multi-tenant. Every tenant's data lives under
  `/tenants/{tenantId}/...` and is fenced off by Firestore security rules.
- A user's tenant and role are carried in **custom claims**
  (`request.auth.token.tenantId`, `request.auth.token.role`) on the verified
  Firebase ID token. Rules reject any cross-tenant read/write, and writes that
  embed a `tenantId` are checked against the path to prevent spoofing.

### Identity (GCIP)

- Authentication uses **Google Cloud Identity Platform (GCIP)** / Firebase Auth.
  Tenants may map to GCIP tenants (`gcipTenantId`) for isolated identity pools.
- ID tokens are verified server-side on every privileged callable.

### Deny-by-default authorization

- `firestore.rules` and `storage.rules` are **deny-by-default**: the final
  catch-all rule denies all reads and writes, and every collection must be
  explicitly opened up — in the same change that introduces it, together with
  rules unit tests (`libs/data-access/src/rules/firestore.rules.spec.ts`).
- Sensitive collections (members, badges, leaderboards, audit logs, B2C
  customer entitlements) are **server-write-only** (`write: if false`); clients
  can never write them directly.

### Server-only privileged operations & claims

- Custom claims (`role`, `tenantId`, `entitlements`) are written **exclusively
  by Cloud Functions** via the Firebase Admin SDK, which bypasses security
  rules. Clients can never escalate their own privileges.
- Privileged callables (`setUserRole`, `inviteMember`, `provisionTenant`)
  validate input with Zod, authorize the caller against their claims, and apply
  least privilege (e.g. a `tenant_admin` can never grant `superadmin` and can
  only act within their own tenant).

### Audit logging (CC7 / Confidentiality)

- Privileged claim-changing operations write structured, immutable audit events
  (actor uid + role, tenant, action, target, server timestamp) to the
  append-only `/auditLogs` collection.
- The collection is `write: if false` (Cloud Functions / Admin SDK only) and
  read-restricted to `superadmin`, with `tenant_admin` able to read events
  scoped to their own tenant. Audit writes are best-effort and non-fatal, so an
  audit failure never rolls back the operation it records.

### App Check (CC6, anti-abuse)

- Firebase **App Check** (reCAPTCHA v3 attestation) can be enabled to ensure
  traffic to Firestore and callable functions originates from the genuine apps.
- It is **opt-in and demo-safe**: with no site key configured (local /
  emulator / dev) it is a complete no-op and nothing is enforced.
- **Production setup:**
  1. Register each app in the Firebase console with reCAPTCHA v3 and obtain a
     site key.
  2. Provide the key to the browser, e.g. inject
     `window.__FORGE_APPCHECK_SITE_KEY__` at deploy time (or pass it to
     `provideForgeFirebase(options, siteKey)`).
  3. Enforce App Check on Firestore and Cloud Functions in the console.
  4. App Check then initializes automatically via `@forge/auth`'s
     `provideForgeAppCheck`.

### Transport & HTTP security headers (CC6)

- All Firebase Hosting traffic is served over **HTTPS**; HTTP is redirected.
- Hosting responses set a **Content-Security-Policy** (self + the Firebase /
  Google / Google Fonts / Stripe origins the apps actually use),
  **Strict-Transport-Security**, **X-Content-Type-Options: nosniff**,
  **X-Frame-Options: SAMEORIGIN** / `frame-ancestors 'self'`, a strict
  **Referrer-Policy**, and a locked-down **Permissions-Policy**.

### Encryption

- **In transit:** TLS for all client ↔ Firebase/GCP traffic.
- **At rest:** Firestore, Cloud Storage, and Identity Platform encrypt data at
  rest by default using Google-managed keys (AES-256).

### Vulnerability & change management (CC7 / CC8)

- **Dependabot** opens weekly PRs for npm and GitHub Actions updates.
- CI runs **`npm audit --audit-level=high`** and a **gitleaks** secret scan on
  every pull request, in addition to lint / test / build and Firestore rules
  tests.
- Change management: all changes flow through pull requests with required CI
  checks; rules and rules tests land together with any new collection.

## Scope notes

- Data shapes are defined once as Zod schemas in `@forge/shared`; all Firestore
  I/O goes through validated converters in `@forge/data-access`.
- This is a security-architecture overview, not an exhaustive control list, and
  reflects the current state of an in-progress SOC 2 readiness effort.
