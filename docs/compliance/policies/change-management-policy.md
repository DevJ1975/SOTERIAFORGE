# Change Management Policy

> **DRAFT — for <Company> to review/ratify; not an adopted policy.** Tailored to Soteria FORGE
> (GitHub, Nx, Firebase). Reflects current code; replace placeholders before adoption.

## 1. Purpose and scope

Defines how changes to the Soteria FORGE codebase, security rules, infrastructure configuration,
and Cloud Functions are proposed, reviewed, tested, approved, and released — so that changes are
authorized, traceable, and do not regress security or availability.

## 2. Change workflow (as implemented today)

1. **Branch & PR.** All changes are made on a branch and submitted as a GitHub pull request. Direct
   commits to `main` are prohibited.
2. **Automated checks (CI).** Every PR runs `.github/workflows/ci.yml`:
   - `nx format:check` (Prettier),
   - `nx affected -t lint test build` (lint, unit tests, builds),
   - a dedicated **rules** job running emulator-backed Firestore security-rules tests
     (`@firebase/rules-unit-testing`, `firestore.rules.spec.ts`).
     CI runs with read-only `contents` permission.
3. **Peer review.** At least one reviewer approves before merge.
4. **Merge.** Only after checks pass and review is approved.

## 3. Mandatory rules (cross-cutting, from `ROADMAP.md` / `README.md`)

- Security rules **and** their unit tests land in the **same PR** as any new collection.
- All Firestore I/O goes through `libs/data-access` Zod converters — no raw `setDoc`/`getDoc` in
  apps.
- Custom claims are written **only** by Cloud Functions.
- Module boundaries are enforced by `@nx/enforce-module-boundaries` (`eslint.config.mjs`).
- CI must stay green; `nx affected` gates lint/test/build on every PR.

## 4. Required, not-yet-enforced controls (gaps)

- **Branch protection** (require review, require status checks, block force-push to `main`) is
  **not represented in-repo** and must be configured in GitHub and documented for audit evidence
  (remediation P0-4).
- **Dependency and secret scanning** in CI are **not present** (remediation P1-4).
- A **documented release/rollback process** and **per-environment (dev/staging/prod)** config are
  **planned** (`ROADMAP.md` Phase 8; remediation P1-7). `.firebaserc` currently targets a single
  demo project.

## 5. Releases and deployment

- Builds are reproducible (`npm ci` from `package-lock.json`).
- Deploys (Firebase Hosting + Functions per `firebase.json`) SHALL target the correct environment
  and be tied to a tagged/approved version. _Define and document the promotion path
  (staging → production) and a rollback runbook._

## 6. Emergency changes

Expedited changes (e.g. an incident hotfix) still require a PR and CI, but may use an abbreviated
review with retroactive documentation and Security Owner sign-off within one business day.

## 7. Infrastructure and configuration changes

Changes to `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc`, GCP project
settings, and CI workflows are in-scope for this policy and require the same PR + review + CI gate
(rule files are tested by the CI rules job).

## 8. Records

PRs, CI results, and review approvals constitute the change record. Retain per the Data Retention
Policy.

---

_Owner: <name>. Approved by: <name>. Effective date: <date>. Next review: <date>._
