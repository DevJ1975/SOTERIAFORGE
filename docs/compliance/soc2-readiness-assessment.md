# SOC 2 Readiness Assessment — Soteria FORGE

> **Not an attestation.** Soteria FORGE is not SOC 2 certified or audited. This is a code-grounded
> readiness assessment. "Implemented" means a control mechanism exists in the codebase today; it
> does **not** mean an auditor has tested its operating effectiveness over a period. See
> [`README.md`](./README.md).

This assessment maps the platform to the AICPA Trust Services Criteria (TSC), focusing on the
**Security / Common Criteria (CC1–CC9)** and adding **Availability (A)** and **Confidentiality
(C)**. The Processing Integrity and Privacy categories are out of scope for this draft.

Legend: **Implemented** / **Implemented (design) — pending prod config + evidence** (the control
design is present in code, but it is not yet independently tested for operating effectiveness and
several such controls still need production configuration — a real Firebase project, a reCAPTCHA
site key, deployed hosting, log retention — to take full effect) / **Partial** / **Gap** /
**Planned**. None of these statuses implies attestation or auditor-tested operating effectiveness.

A recurring, important caveat: the platform currently runs against the **Firebase emulator suite**
with a demo project and **no provisioned production Firebase project** (`README.md`, `ROADMAP.md`
Phase 8). Many CC/A controls therefore depend on infrastructure that does not exist yet and are
marked **Gap / Planned** even where the application-layer design is sound.

---

## CC1 — Control Environment

CC1 concerns governance: integrity/ethics, board oversight, organizational structure, and
accountability. These are **organizational** controls, largely outside the codebase.

- **Current implementation:** Engineering discipline is encoded in the repo — documented
  conventions and cross-cutting rules (`README.md` "Conventions"; `ROADMAP.md` "Cross-cutting
  rules": rules + rules tests land in the same PR, all I/O through Zod converters, claims only
  written by Cloud Functions, CI must stay green). Module boundaries are enforced by
  `@nx/enforce-module-boundaries` (`eslint.config.mjs`).
- **Status:** **Gap** (as a SOC 2 control). The codebase shows good engineering hygiene but there
  are no adopted policies, defined security roles/ownership, background-check process, or
  org-chart evidence.
- **Remediation:** Ratify the draft policies in [`policies/`](./policies/); assign control
  owners (replace the placeholders in `controls-matrix.md`); define a security function and
  reporting line; add HR onboarding/offboarding and background-check procedures.

## CC2 — Communication and Information

CC2 concerns internal/external communication of objectives and responsibilities.

- **Current implementation:** Internal technical communication is strong: `README.md`,
  `ROADMAP.md`, `docs/`, and inline rule/function docblocks (e.g. the deny-by-default rationale in
  `firestore.rules`) communicate security expectations to engineers.
- **Status:** **Partial — improving.** A customer-facing **Trust & Security page**
  (`apps/storefront/src/app/trust.ts`) and a published **vulnerability disclosure process** with a
  security contact (`SECURITY.md`) now exist (implemented in design; not yet exercised). Still
  missing: customer-facing terms/SLAs, a status page, and a formal internal security-policy
  acknowledgement process.
- **Remediation:** Continue publishing security/trust commitments to customers; add a policy
  acknowledgement workflow; exercise the external security-reporting channel now documented in
  `SECURITY.md` (and the Incident Response draft).

## CC3 — Risk Assessment

- **Current implementation:** The threat model is implicit in the design (tenant isolation,
  deny-by-default, server-only claim writes) and in `ROADMAP.md` Phase 8, which enumerates known
  hardening risks (App Check, backups/PITR, monitoring, rate limiting).
- **Status:** **Gap.** No formal, documented risk-assessment process, risk register, or
  fraud-risk consideration.
- **Remediation:** Stand up a periodic risk-assessment cadence and a risk register; this
  readiness folder and `remediation-backlog.md` can seed the initial register.

## CC4 — Monitoring of Controls

- **Current implementation:** CI (`.github/workflows/ci.yml`) continuously verifies code-level
  controls on every PR (`nx format:check`; `nx affected -t lint test build`; emulator-backed
  Firestore rules tests via `@firebase/rules-unit-testing`). Rules tests live in
  `libs/data-access/src/rules/firestore.rules.spec.ts`.
- **Status:** **Partial.** Automated verification of code controls is genuinely good, and CI now
  also runs **dependency and secret scanning** on every PR (`dependency-audit` =
  `npm audit --audit-level=high`; `secret-scan` = gitleaks) plus weekly Dependabot updates
  (`.github/dependabot.yml`) — these are **implemented in design** but have no operating-
  effectiveness evidence yet. What is still missing is monitoring of **operational** controls (no
  log review, no alerting, no internal control audits, no periodic access reviews).
- **Remediation:** These CI scans now exist; next, add log/alert review procedures once monitoring
  exists (CC7), periodic access reviews, and internal control self-audits. Consider adding CodeQL
  and GitHub-native secret scanning / push protection.

## CC5 — Control Activities

- **Current implementation:** Control activities are embedded in code and tooling: deny-by-default
  authorization (`firestore.rules`, `storage.rules`), least-privilege role logic
  (`apps/functions/src/lib/authz.ts`), schema validation (`libs/data-access/src/lib/converters.ts`),
  and module-boundary enforcement (`eslint.config.mjs`). The PR + CI gate is the primary change
  control activity.
- **Status:** **Partial.** Technical control activities are strong; their **policy** counterparts
  and segregation-of-duties documentation are not yet adopted.
- **Remediation:** Document control activities in ratified policies; formalize branch protection
  and required reviewers (see CC8).

---

## CC6 — Logical and Physical Access Controls

This is the platform's strongest area and the core of the security story.

### CC6.1 — Logical access security (identity, authentication, authorization)

- **Current implementation:**
  - **Authentication** via Google Cloud Identity Platform (GCIP), multi-tenant, through
    AngularFire (`libs/auth/src/lib/firebase.providers.ts`,
    `libs/auth/src/lib/principal.store.ts`). Tenancy is resolved from the subdomain
    (`libs/auth/src/lib/tenant-host.ts`).
  - **Authorization** via custom claims (`role`, `tenantId`, `entitlements`) parsed through a Zod
    schema (`libs/auth/src/lib/claims.ts`, `libs/shared/src/lib/schemas/identity.ts`).
  - **Route guards** enforce sign-in and role on the client
    (`libs/auth/src/lib/guards.ts`: `authGuard`, `roleGuard`).
  - **Server-side authorization** is the source of truth: `firestore.rules` checks
    `request.auth.token.tenantId` / `request.auth.token.role`; the deny-by-default catch-all
    (`match /{document=**} { allow read, write: if false; }`) closes everything not explicitly
    opened. Privileged role-management logic is centralized and unit-tested in
    `apps/functions/src/lib/authz.ts` (`canManageRole`: superadmin can do anything; tenant_admin
    is constrained to its own tenant and may never grant `superadmin`).
- **Status:** **Implemented** (application layer). Client guards are convenience; the Firestore
  rules and Cloud Functions are the enforced boundary.
- **Remediation / hardening:** Add **MFA** policy/enforcement (GCIP supports it; not configured —
  Gap). **Firebase App Check** is now wired (`libs/auth/src/lib/app-check.providers.ts`,
  `provideForgeAppCheck`) but **demo-safe**: a complete no-op until a real reCAPTCHA v3 site key is
  configured — so production enforcement (site key + a real project + console-side enforcement on
  Firestore and callables) remains a gap. Add periodic **access reviews** of members and
  superadmins.

### CC6.2 / CC6.3 — Provisioning, modification, and de-provisioning of access

- **Current implementation:** Access lifecycle is server-controlled. Custom claims are written
  **only** by Cloud Functions (`apps/functions/src/main.ts`: `setUserRole`, `inviteMember`,
  `provisionTenant`, `onMemberWritten`); clients can never write claims (enforced because the
  Admin SDK bypasses rules and rules deny client writes to `members`). De-provisioning is handled
  by `member-claims-sync.core.ts`: deactivating or deleting a member doc clears that user's claims
  (`setCustomClaims(uid, null)`), and reactivation rebuilds them. Role grants are validated and
  authorized in `set-user-role.core.ts` / `invite-member.core.ts` via `canManageRole`.
- **Status:** **Implemented** (mechanism). The grant/revoke path is well-designed and tested
  (`*.core.spec.ts`).
- **Remediation:** Add a documented joiner/mover/leaver procedure and evidence of periodic access
  reviews (organizational); confirm GCIP user disablement on offboarding.

### CC6.6 — Boundary protection (external threats)

- **Current implementation:** All client traffic is HTTPS/TLS terminated by Firebase Hosting and
  the Google front end (managed). Callable functions set `cors: true` and run in `us-central1`
  (`apps/functions/src/main.ts`). Deny-by-default rules constrain the data boundary. **HTTP
  security headers** are now configured per app in `firebase.json` (`hosting[].headers`):
  Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options /
  `frame-ancestors 'self'`, Referrer-Policy, and a locked-down Permissions-Policy. **Firebase App
  Check** is wired (`libs/auth/src/lib/app-check.providers.ts`).
- **Status:** **Partial — improving.** The HTTP-header hardening and the App Check wiring are
  **implemented in design** but not yet effective end-to-end: the headers only take effect on
  **deployed** Firebase Hosting (not the local emulator) and have no operating-effectiveness
  evidence, and App Check is a **no-op until a real reCAPTCHA site key + production project + console
  enforcement** exist. There is still **no rate limiting** on callables (Planned, Phase 8) — a
  DoS/abuse exposure.
- **Remediation:** Provision a real Firebase project, configure the App Check site key and enforce
  App Check on Firestore + callables; verify the deployed headers; add per-caller rate
  limiting/quotas on callables (Phase 8).

### CC6.7 — Data in transit / restricting movement of information

- **Current implementation:** TLS in transit via Firebase/GCP managed endpoints. Tenant data
  cannot move across tenant boundaries: every collection helper is tenant-path-scoped
  (`libs/data-access/src/lib/collections.ts`) and rules forbid cross-tenant reads
  (`inTenant(tenantId)`), with the embedded `tenantId` spoof guard on writes
  (`request.resource.data.tenantId == tenantId`) — now extended to learner-owned **enrollments** so
  a learner cannot stamp another tenant onto their own enrollment (`firestore.rules`; tested in
  `libs/data-access/src/rules/firestore.rules.spec.ts`).
- **Status:** **Implemented** for tenant isolation in transit and at the data layer.
- **Remediation:** None at the app layer; add DLP/egress considerations if/when exports are built.

### CC6.8 — Prevention/detection of unauthorized software (integrity of code)

- **Current implementation:** Change integrity via PR + CI (`.github/workflows/ci.yml`),
  module-boundary enforcement, and `package-lock.json` pinning with `npm ci` in CI. CI now also
  runs a **`dependency-audit`** job (`npm audit --audit-level=high`) and a **`secret-scan`** job
  (gitleaks) on every PR, and **Dependabot** (`.github/dependabot.yml`) opens weekly npm /
  GitHub-Actions update PRs.
- **Status:** **Partial — improving.** The dependency-vulnerability and secret scanning are now
  **implemented in design** (no operating-effectiveness evidence yet), but there is still **no
  artifact signing** and **no documented branch-protection/required-review configuration** in-repo,
  and no CodeQL.
- **Remediation:** Document and enable branch protection with required reviews (P1, see backlog);
  consider CodeQL and GitHub-native secret scanning / push protection; retain scan results as
  evidence.

---

## CC7 — System Operations (monitoring, incident detection and response)

- **Current implementation:** **Audit logging of privileged actions is now implemented in design.**
  `setUserRole`, `inviteMember`, and `provisionTenant` write structured, best-effort, append-only
  audit events (actor uid + role, tenant, action, target, server timestamp) to the `/auditLogs`
  collection (`apps/functions/src/lib/audit-log.ts`, `ports.ts`, `adapters.ts`, wired in
  `main.ts`). The collection is client-immutable in `firestore.rules`
  (`match /auditLogs/{auditId}` is `write: if false`; reads restricted to superadmin plus a
  `tenant_admin` scoped to its own tenant), exercised by `audit-log.spec.ts` and the rules tests.
  Writes are deliberately non-fatal so an audit failure never rolls back the operation it records.
  Separately, Cloud Functions still emit `console.error` for unhandled errors
  (`apps/functions/src/main.ts` `toHttpsError`).
- **Status:** **Partial.** The audit-logging control design is in code, but it is **not yet tested
  for operating effectiveness** and needs a **production Firebase project plus log retention** to
  be meaningful. There is still **no monitoring or alerting** (Cloud Logging/Error Reporting,
  budget alerts are Planned, Phase 8) and **no incident detection** tooling, so CC7 overall remains
  short of audit-ready.
- **Remediation (high priority):** Provision a production project and define audit-log retention;
  provision Cloud Logging/Error Reporting with alerting; adopt and test the Incident Response Plan
  draft. See `remediation-backlog.md` P0/P1.

## CC8 — Change Management

- **Current implementation:** Changes flow through Git/GitHub PRs gated by CI
  (`.github/workflows/ci.yml`): `nx format:check`, then `nx affected -t lint test build`, plus a
  dedicated **rules** job running emulator-backed Firestore rules tests, plus additive
  **`dependency-audit`** (npm audit) and **`secret-scan`** (gitleaks) security gates. A documented
  cross-cutting rule requires security rules and their unit tests to land in the **same PR** as any
  new collection (`ROADMAP.md`, `README.md`). `npm ci` installs from `package-lock.json` for
  reproducible builds.
- **Status:** **Partial — strong technical pipeline.** What is missing as audit evidence: branch
  protection / required-reviewer configuration is not represented in-repo, there is no documented
  approval/segregation-of-duties or release/rollback process, and CI permissions are read-only
  with no deploy gating defined here.
- **Remediation:** Enable and document branch protection (require PR review, require CI to pass,
  restrict direct pushes to `main`); document a release and rollback process; capture change-
  approval evidence. See Change Management policy draft and backlog P1.

## CC9 — Risk Mitigation (incl. vendor/third-party management)

- **Current implementation:** Key vendors are GCP/Firebase (hosting, auth, Firestore, functions)
  and Stripe (B2C payments — schemas in `libs/shared/src/lib/schemas/commerce.ts`, including a
  `stripeEventLog` idempotency design; the webhook handler itself is Phase 5 and not yet
  implemented). Stripe is referenced only by IDs in schemas; no card data is handled by the app.
- **Status:** **Gap.** No vendor inventory, no review of subservice organizations' SOC reports
  (GCP, Stripe), no vendor risk assessments, and no business-continuity/insurance mitigation
  documented.
- **Remediation:** Adopt the Vendor Management draft; maintain a vendor register; collect and
  review GCP and Stripe SOC 2 reports annually; document reliance on subservice organizations in
  the eventual system description.

---

## Availability (A series)

- **Current implementation:** The intended platform inherits GCP/Firebase managed availability.
  Hosting is configured per app (`firebase.json`). **However, no production project is
  provisioned** (`.firebaserc` points at the demo `soteria-forge-dev`; the app defaults to the
  emulator suite — `libs/auth/src/lib/firebase.providers.ts`).
- **Status:** **Gap / Planned.** No backups or Point-in-Time Recovery, no capacity/budget alerts,
  no monitoring, no tested DR, and no defined RTO/RPO. All are Planned in `ROADMAP.md` Phase 8.
- **Remediation:** Provision dev/staging/prod Firebase projects; enable Firestore PITR and
  scheduled backups; configure budget and uptime alerting; define and test RTO/RPO; adopt the
  BC/DR draft. See backlog P0 (backups) and P1 (monitoring).

## Confidentiality (C series)

- **Current implementation:**
  - **Encryption at rest:** provided by default by Google Cloud / Firestore (platform-managed) —
    no application configuration; relied upon as a subservice control.
  - **Encryption in transit:** TLS via Firebase/GCP managed endpoints.
  - **Access restriction to confidential data:** tenant isolation and deny-by-default rules
    (`firestore.rules`) restrict confidential tenant data to its tenant; B2C customer docs are
    owner-read-only and webhook-written (`/b2c/store/customers/{uid}`).
  - **Data classification** is implicit in the schema and rules (public catalog is
    `allow read: if true`; everything tenant-scoped is gated).
- **Status:** **Partial.** Encryption (at rest/in transit) is inherited from GCP and the access
  model is sound, but there is **no formal data classification/retention policy, no secrets-
  management standard, and no documented disposal process.** Secrets handling for the planned
  Stripe webhook and AI-tutor proxy (server-side keys, per `ROADMAP.md`) is designed but not yet
  implemented; a **gitleaks `secret-scan` CI job** (`.github/workflows/ci.yml`) now guards against
  accidental credential commits (implemented in design; no operating-effectiveness evidence yet).
- **Remediation:** Adopt the Data Retention & Classification and Information Security policy
  drafts; standardize on Secret Manager for server secrets; supplement the CI secret scan with
  GitHub-native secret scanning / push protection; define retention windows and deletion procedures
  (especially for B2C/PII).

---

## Summary of statuses

| TSC area                        | Status                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| CC1 Control Environment         | Gap                                                                                                          |
| CC2 Communication & Information | Partial (Trust page + SECURITY.md disclosure now in design)                                                  |
| CC3 Risk Assessment             | Gap                                                                                                          |
| CC4 Monitoring of Controls      | Partial (CI dependency/secret scanning now in design)                                                        |
| CC5 Control Activities          | Partial                                                                                                      |
| CC6 Logical & Physical Access   | **Implemented (app layer)**; App Check + HTTP headers in design (pending prod config); MFA / rate-limit gaps |
| CC7 System Operations           | Partial (audit logging in design; monitoring/alerting/IR gaps)                                               |
| CC8 Change Management           | Partial (strong CI incl. dependency/secret scans; branch protection undocumented)                            |
| CC9 Risk Mitigation / Vendors   | Gap                                                                                                          |
| Availability                    | Gap / Planned (no prod, no backups/DR)                                                                       |
| Confidentiality                 | Partial (encryption inherited; policies/secrets gaps)                                                        |

The strongest, genuinely-in-code areas are **CC6 (access/tenant isolation)** and the technical
half of **CC8 (change pipeline)**. Several controls recently moved from gaps to **implemented in
design** — audit logging (CC7), Firebase App Check wiring and HTTP security headers (CC6.6), and CI
dependency/secret scanning (CC4/CC8) — but these are control _designs_ in code, **not** tested for
operating effectiveness, and several still need production configuration (a real Firebase project,
a reCAPTCHA site key, deployed hosting, log retention) before they are effective. The largest
remaining gaps are operational and organizational: **monitoring/alerting and IR (CC7)**,
**Availability (production, backups, DR)**, **CC9 (vendor management)**, **enforced MFA**, **rate
limiting**, and the absence of adopted policies (**CC1**).
