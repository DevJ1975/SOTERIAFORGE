# Remediation Backlog — Path to SOC 2 Audit-Readiness

> **Not an attestation.** This is an engineering backlog to close the gaps identified in the
> [readiness assessment](./soc2-readiness-assessment.md) and [controls matrix](./controls-matrix.md).
> Completing it does not by itself produce a SOC 2 report — an independent auditor and an
> observation period are still required.

Priorities:

- **P0** — blocks any credible Type I; foundational (production environment, backups, audit
  logging, policies, branch protection).
- **P1** — required for a defensible Type I/II (monitoring, MFA, App Check, vendor mgmt, IR
  testing, CI security scanning).
- **P2** — hardening and maturity (rate limiting, access-review automation, DLP, performance/a11y).

Most infrastructure items map to **`ROADMAP.md` Phase 8 (Hardening & launch)** — cross-references
noted as _[Phase 8]_.

---

## P0 — Foundational (do first)

### P0-1 — Provision real dev/staging/prod Firebase projects _[Phase 8]_

- **Why:** Everything runs on the emulator suite today; `.firebaserc` targets a single demo
  project (`soteria-forge-dev`) and apps auto-connect to emulators on localhost
  (`libs/auth/src/lib/firebase.providers.ts`). No production environment = no auditable production
  controls.
- **Change:** Create separate GCP/Firebase projects; replace `DEFAULT_FIREBASE_OPTIONS` /
  per-environment config (`libs/auth/src/lib/firebase.providers.ts`); update `.firebaserc` hosting
  targets per environment.
- **Area:** `.firebaserc`, `firebase.json`, `libs/auth/src/lib/firebase.providers.ts`.

### P0-2 — Firestore backups + Point-in-Time Recovery (PITR) _[Phase 8]_

- **Why:** No backup/restore = no Availability story (control BU-1, A1.2).
- **Change:** Enable Firestore PITR; schedule managed exports to a backup bucket with retention;
  document and **test** a restore.
- **Area:** GCP project config (infra), documented in BC/DR policy.

### P0-3 — Audit logging for privileged actions (control LOG-1)

- **Why:** Role grants, tenant provisioning, invites, and deactivations are not recorded to any
  tamper-evident log. `auditable` (`libs/shared/src/lib/schemas/primitives.ts`) only stamps
  create/update metadata.
- **Change:** In each Function core (`set-user-role.core.ts`, `invite-member.core.ts`,
  `provision-tenant.core.ts`, `member-claims-sync.core.ts`) write a structured, append-only audit
  record (actor uid, action, target, tenant, timestamp, outcome) to an `/audit` collection
  (Functions-write-only, superadmin-read-only in `firestore.rules`) and/or structured Cloud
  Logging. Add a Zod schema in `libs/shared` and a rules block + rules test (same-PR rule).
- **Area:** `apps/functions/src/lib/*.core.ts`, `libs/shared/src/lib/schemas/`, `firestore.rules`,
  `libs/data-access/src/rules/firestore.rules.spec.ts`.

### P0-4 — Enable and document GitHub branch protection (control CM-4)

- **Why:** The CI gate (`.github/workflows/ci.yml`) is only meaningful if `main` requires passing
  checks and review; this is not represented or enforced in-repo.
- **Change:** Require PR review (≥1 reviewer), require the `main` and `rules` CI jobs to pass,
  disallow direct pushes/force-pushes to `main`. Document the configuration (a screenshot or
  exported ruleset reference) for audit evidence.
- **Area:** GitHub repo settings; reference in Change Management policy.

### P0-5 — Ratify core policies (controls POL-1, CC1)

- **Why:** No adopted policies exist; CC1 cannot be met without them.
- **Change:** Review, tailor, and formally adopt the drafts in `docs/compliance/policies/`
  (Information Security, Access Control, Incident Response, Change Management, Data
  Retention/Classification, Vendor Management, BC/DR). Assign owners (replace placeholders in
  `controls-matrix.md`) and record an acknowledgement date.
- **Area:** `docs/compliance/policies/` + organizational sign-off.

---

## P1 — Required for a defensible audit

### P1-1 — Monitoring, alerting, and error reporting _[Phase 8]_ (control LOG-2)

- **Why:** Only `console.error` exists today (`apps/functions/src/main.ts`). No detection or
  alerting (CC7).
- **Change:** Wire Cloud Logging + Error Reporting; create log-based metrics and alert policies
  (auth failures, function error rate, denied-rule spikes); add budget alerts.
- **Area:** GCP/infra; emit structured logs from functions.

### P1-2 — Enforce MFA (control AC-8)

- **Why:** GCIP supports MFA but none is configured; privileged accounts (superadmin/tenant_admin)
  are single-factor.
- **Change:** Enable MFA in GCIP, enforce for admin roles at minimum; surface enrollment in
  `libs/auth` login flow (`libs/auth/src/lib/login/login.ts`, `principal.store.ts`).
- **Area:** GCIP config + `libs/auth`.

### P1-3 — Firebase App Check _[Phase 8]_ (control BP-1)

- **Why:** Without App Check, the public Firebase config lets any client call the SDK/callables
  (rules/authz still deny unauthorized data, but it widens the attack surface — CC6.6).
- **Change:** Register App Check (reCAPTCHA Enterprise / Play Integrity), add the provider in
  `provideForgeFirebase` (`libs/auth/src/lib/firebase.providers.ts`), and enforce on Firestore +
  callable functions.
- **Area:** `libs/auth/src/lib/firebase.providers.ts`, `apps/functions/src/main.ts`, GCP config.

### P1-4 — CI security scanning (controls SEC-2, VUL-1)

- **Why:** No dependency vulnerability scanning and no secret scanning gate exist
  (`.github/workflows/ci.yml`).
- **Change:** Add Dependabot (or `npm audit`/Renovate) and CodeQL; add a secret scanner
  (e.g. gitleaks) as a CI job; enable GitHub secret scanning + push protection.
- **Area:** `.github/workflows/ci.yml`, `.github/dependabot.yml` (new).

### P1-5 — Vendor management (control VM-1)

- **Why:** No vendor register or review of subservice SOC reports.
- **Change:** Build a vendor inventory (GCP/Firebase, Stripe, GitHub, any AI provider for the
  Phase 7 tutor); obtain and review their SOC 2 reports annually; document subservice reliance for
  the eventual system description.
- **Area:** `docs/compliance/policies/vendor-management-policy.md` + vendor register.

### P1-6 — Adopt and exercise Incident Response (control IR-1)

- **Why:** Draft IR plan only; never tested.
- **Change:** Ratify `policies/incident-response-plan.md`; define on-call/roles; run a tabletop
  exercise and retain evidence; set up an external security reporting channel (security@ inbox).
- **Area:** organizational + `docs/compliance/policies/`.

### P1-7 — Documented release/rollback + per-environment config _[Phase 8]_ (control CM-5)

- **Why:** Single demo project; no versioned release/rollback process.
- **Change:** Define a release procedure (build → staging → prod), deploy gating, and a rollback
  runbook; tie deploy to tagged versions.
- **Area:** `.firebaserc`, CI/CD, Change Management policy.

### P1-8 — Secrets management standard (control SEC-1)

- **Why:** Stripe webhook (Phase 5) and AI-tutor proxy (Phase 7) will need server-side secrets;
  there is no standard or Secret Manager wiring yet.
- **Change:** Standardize on Google Secret Manager / Functions secret params; document handling,
  rotation, and least-privilege access. Enforce no secrets in client bundles.
- **Area:** `apps/functions`, Information Security + Data policies.

---

## P2 — Hardening and maturity

### P2-1 — Rate limiting on callable functions _[Phase 8]_ (control BP-2)

- **Why:** No throttling on `setUserRole`/`inviteMember`/`provisionTenant`
  (`apps/functions/src/main.ts`) — abuse/DoS exposure.
- **Change:** Add per-caller/IP rate limiting or quota (App Check + a token-bucket in
  Firestore/Memorystore, or Cloud Armor at the edge).
- **Area:** `apps/functions/src/main.ts` + infra.

### P2-2 — Automated/periodic access reviews (control AC-9)

- **Change:** Build a superadmin report of members/roles per tenant and a quarterly review
  workflow; retain sign-off evidence.
- **Area:** `apps/superadmin` (Phase 6 cross-tenant tooling), `apps/functions`.

### P2-3 — Data retention/deletion automation (Confidentiality / Privacy)

- **Change:** Implement retention windows and deletion jobs for PII/B2C data per the Data
  Retention policy; support data-subject deletion requests.
- **Area:** `apps/functions`, `libs/shared` schemas, Data Retention policy.

### P2-4 — Accessibility (WCAG 2.1 AA) and performance passes _[Phase 8]_

- **Why:** Listed in `ROADMAP.md` Phase 8; relevant to enterprise/government procurement
  (Section 508).
- **Change:** WCAG audit + fixes across the four apps; performance and load testing of
  rules-heavy reads.
- **Area:** all `apps/*`, `libs/ui`.

### P2-5 — Full e2e regression suite _[Phase 8]_

- **Change:** Playwright regression across all four apps in CI (the dependency is already present;
  `@nx/playwright`).
- **Area:** `.github/workflows/ci.yml`, app e2e projects.

---

## Quick wins an engineer could likely close fast

These are low-effort relative to impact and are good first moves:

- **P0-4 branch protection** — configuration only; no code. Immediately strengthens CM-4/CC8.
- **P1-4 CI security scanning** — add `dependabot.yml`, a CodeQL workflow, and a gitleaks job;
  enable GitHub secret scanning. Mostly config.
- **P0-3 audit logging** — the Function cores are already small, pure, and well-tested; adding an
  append-only audit write + schema + a rules block follows the existing same-PR rules pattern.
- **P1-5 / P1-6 / P0-5 policy adoption** — the drafts exist; ratification is review + sign-off, not
  engineering.

The infrastructure-dependent items (P0-1 production, P0-2 backups, P1-1 monitoring, P1-3 App
Check) require a real Firebase project first (P0-1 is the unlock for most of Availability and CC7).
