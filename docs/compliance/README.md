# Soteria FORGE — SOC 2 Readiness Documentation

> **Disclaimer — not an attestation.** Soteria FORGE is **pursuing** SOC 2 and is **not currently
> SOC 2 certified, audited, or attested**. There is no SOC 2 Type I or Type II report, no
> independent auditor engagement, and no audit period in progress. The material in this folder is
> **readiness documentation**: an honest, code-grounded assessment of which controls exist today,
> which are partial, and which are gaps that must be closed before a real audit. Nothing here
> should be read as a claim of compliance. Where a control does not yet exist, it is marked
> **Gap** or **Planned** rather than implied to be in place.

## Audience

Prepared for security due diligence by an enterprise prospect (Hartsfield-Jackson Atlanta
International Airport authority). It describes the current engineering state of the platform and a
prioritized path to audit-readiness.

## Scope of the system

Soteria FORGE is a multi-tenant LMS (B2B + B2C) built on:

- **Frontend:** Angular 20 / Nx monorepo, four apps (`learner`, `admin`, `superadmin`,
  `storefront`).
- **Identity:** Google Cloud Identity Platform (GCIP) multi-tenant auth via AngularFire.
- **Data:** Cloud Firestore with deny-by-default security rules and tenant isolation via custom
  claims.
- **Server logic:** Firebase Cloud Functions (claim-setting, tenant provisioning, member sync).
- **Commerce:** Stripe (B2C storefront) — schemas defined; webhook handler is Phase 5 (not yet
  implemented).
- **Hosting:** Firebase Hosting (one site per app).

Today the platform runs against the **Firebase emulator suite** with a demo project
(`soteria-forge-dev`); no production Firebase project has been provisioned yet (see `README.md`
and `ROADMAP.md` Phase 8). This materially affects several availability, backup, and monitoring
controls, which are accordingly marked **Gap / Planned**.

## Documents in this folder

| File                                                             | Purpose                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`soc2-readiness-assessment.md`](./soc2-readiness-assessment.md) | Maps the platform to the SOC 2 Trust Services Criteria (CC1–CC9, plus Availability, Confidentiality) with current implementation, status, and remediation. |
| [`controls-matrix.md`](./controls-matrix.md)                     | Control-by-control table: Control ID, TSC ref, description, implementation/evidence, owner, status.                                                        |
| [`remediation-backlog.md`](./remediation-backlog.md)             | Prioritized (P0/P1/P2) engineering backlog to reach audit-readiness, cross-referenced to ROADMAP Phase 8.                                                  |
| [`policies/`](./policies/)                                       | Starter-**draft** policy templates (clearly marked as drafts to be reviewed and ratified).                                                                 |

## How to read the status labels

- **Implemented** — a control mechanism exists in the codebase today and is cited to a file. This
  is **not** the same as "operating effectively over time," which only an auditor can attest.
- **Implemented (design) — pending prod config + evidence** — the control _design_ is present in
  code, but it is not yet independently tested for operating effectiveness and several such controls
  still need **production configuration** to take effect (a real Firebase project, a reCAPTCHA site
  key, deployed hosting, log retention). It still implies **no** attestation.
- **Partial** — some of the control exists; meaningful pieces are missing.
- **Gap** — the control is not present in the codebase.
- **Planned** — explicitly scheduled, most often in `ROADMAP.md` Phase 8.

## Honest headline

**Genuinely strong today (in code):** tenant data isolation and deny-by-default authorization
(`firestore.rules`, `storage.rules`), server-only privilege escalation (custom claims written
exclusively by Cloud Functions), schema-validated I/O (Zod converters), and an enforced change
pipeline (PR-gated CI running format/lint/test/build plus emulator-backed rules tests).

**Recently implemented in design (not yet tested for operating effectiveness; several still need
production config):** best-effort immutable **audit logging** of privileged actions to `/auditLogs`
(`apps/functions/src/lib/audit-log.ts` + `firestore.rules`); demo-safe **Firebase App Check** wiring
(`libs/auth/src/lib/app-check.providers.ts`, a no-op until a site key is configured); **HTTP
security headers** (CSP/HSTS/etc. in `firebase.json`); CI **dependency and secret scanning**
(`npm audit` + gitleaks) and **Dependabot** (`.github/workflows/ci.yml`, `.github/dependabot.yml`);
the enrollment **`tenantId` spoof guard** (`firestore.rules`); and a published **vulnerability
disclosure process** (`SECURITY.md`).

**Top gaps to audit-readiness:** no production environment yet (everything runs on emulators); no
monitoring / alerting; no backups or PITR; **App Check production enforcement** (site key + real
project + console enforcement); no enforced MFA policy; no rate limiting; no documented vendor
management, incident response, or BC/DR; and no adopted (ratified) policies. These — and the
production-config / evidence work for the recently implemented controls — are tracked in
[`remediation-backlog.md`](./remediation-backlog.md).

_Last reviewed: 2026-06-19. This document set is point-in-time and must be re-validated against the
codebase before being relied upon._
