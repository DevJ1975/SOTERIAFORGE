# Information Security Policy

> **DRAFT — for <Company> to review/ratify; not an adopted policy.** This template is tailored to
> the Soteria FORGE stack (Firebase/GCP, GitHub, Angular/Nx multi-tenant SaaS) and reflects the
> _current_ state of the codebase. Replace `<Company>`, owners, and dates before adoption.
> Soteria FORGE is not SOC 2 attested; adopting this policy is one step toward readiness.

## 1. Purpose and scope

This policy defines how <Company> protects the confidentiality, integrity, and availability of the
Soteria FORGE platform and customer data. It applies to all employees, contractors, and systems
that build, operate, or access the platform (GCP/Firebase projects, the GitHub repository, and the
four applications: `learner`, `admin`, `superadmin`, `storefront`).

## 2. Roles and responsibilities

- **Security Owner (<name/role>):** owns this policy, the risk register, and the remediation
  backlog (`docs/compliance/remediation-backlog.md`).
- **Engineering:** implements and maintains technical controls (security rules, Cloud Functions,
  CI).
- **All personnel:** comply with this policy and report incidents per the Incident Response Plan.

## 3. Security principles (as implemented today)

1. **Deny-by-default authorization.** Firestore and Storage rules deny everything not explicitly
   allowed (`firestore.rules`, `storage.rules`). New collections must ship rules **and** rules
   tests in the same PR.
2. **Tenant isolation.** Tenant data is segregated via custom claims
   (`request.auth.token.tenantId`) and tenant-scoped paths
   (`libs/data-access/src/lib/collections.ts`). Cross-tenant access is denied and tested
   (`libs/data-access/src/rules/firestore.rules.spec.ts`).
3. **Server-only privilege.** Custom claims (`role`, `tenantId`, `entitlements`) are written
   **only** by Cloud Functions (`apps/functions`); clients never write claims.
4. **Validated I/O.** All Firestore reads/writes pass through Zod converters
   (`libs/data-access/src/lib/converters.ts`); callable inputs are Zod-validated.
5. **Least privilege.** Role-management is constrained (`apps/functions/src/lib/authz.ts`):
   tenant_admins act only within their tenant and may never grant superadmin.
6. **Change control.** All changes flow through PRs gated by CI (`.github/workflows/ci.yml`).

## 4. Data protection

- **In transit:** TLS/HTTPS via Firebase Hosting / GCP managed endpoints.
- **At rest:** Google Cloud default encryption at rest (relied upon as a subservice control).
- **Classification & retention:** governed by the Data Retention & Classification Policy.

## 5. Access control

Governed by the Access Control Policy. Authentication is via GCIP; authorization via role claims
and server-side rules.

## 6. Secure development

- Mandatory PR review and passing CI (lint, test, build, format, and emulator-backed rules tests).
- Module boundaries enforced by `@nx/enforce-module-boundaries` (`eslint.config.mjs`).
- Dependencies pinned via `package-lock.json`; CI installs with `npm ci`.
- **Planned controls (not yet in place):** dependency vulnerability scanning, secret scanning, and
  branch protection (see remediation backlog P0-4, P1-4).

## 7. Secrets management

Server-side secrets (e.g. Stripe keys, AI provider keys) MUST be stored in Google Secret Manager /
Functions secret parameters and never committed or shipped in client bundles. _Current state: no
server secrets exist in the repo yet; the Stripe webhook and AI tutor proxy are not implemented._

## 8. Logging and monitoring

Security-relevant events SHALL be logged and monitored. _Current state: this is a **gap** —
structured audit logging, monitoring, and alerting are not yet implemented (remediation P0-3,
P1-1)._

## 9. Vendor management

Third-party/subservice providers (GCP/Firebase, Stripe, GitHub) are managed per the Vendor
Management Policy, including annual review of their SOC 2 reports.

## 10. Incident response and business continuity

Governed by the Incident Response Plan and the Business Continuity & DR Plan.

## 11. Exceptions and review

Exceptions require Security Owner approval and a remediation date. This policy is reviewed at least
annually and after material changes.

---

_Owner: <name>. Approved by: <name>. Effective date: <date>. Next review: <date>._
