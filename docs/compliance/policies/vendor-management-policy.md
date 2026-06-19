# Vendor Management Policy

> **DRAFT — for <Company> to review/ratify; not an adopted policy.** Tailored to Soteria FORGE.
> The vendor register below is **indicative**, derived from the codebase; confirm and complete it
> before adoption.

## 1. Purpose and scope

Defines how <Company> selects, assesses, and monitors third-party and subservice providers that
process or could affect Soteria FORGE data or availability.

## 2. Vendor register (indicative — confirm before adoption)

| Vendor                  | Role in the platform                                           | Data exposure                                  | Evidence to collect                  |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| Google Cloud / Firebase | Hosting, GCIP auth, Firestore, Cloud Functions, encryption     | All platform data (subservice org)             | GCP SOC 2 / ISO reports; status page |
| Stripe                  | B2C payments (Phase 5; schemas in `commerce.ts`, webhook TBD)  | Payment metadata, customer IDs (no PAN in app) | Stripe SOC 2; PCI attestation        |
| GitHub                  | Source control, CI/CD (`.github/workflows/ci.yml`)             | Source code, build pipeline                    | GitHub SOC 2                         |
| AI provider (Phase 7)   | AI tutor model API via server-side proxy (not yet implemented) | Course content / prompts (server-side keys)    | Provider security/SOC report; DPA    |

_Note: Stripe and the AI provider relate to features that are **planned/not yet implemented**;
include them once those integrations ship._

## 3. Subservice organizations

GCP/Firebase is a **subservice organization** carrying critical controls (encryption at rest/in
transit, infrastructure availability). In a SOC 2 report these are addressed via the carve-out or
inclusive method. <Company> SHALL obtain and review GCP's SOC 2 report and rely on it for those
controls (controls ENC-1, ENC-2 in the controls matrix).

## 4. Assessment and onboarding

Before a vendor processes platform/customer data:

- Assess its security posture (request SOC 2 / ISO 27001 / pen-test summary).
- Execute appropriate agreements (DPA where PII is processed).
- Record the vendor in the register with a data-classification of what it touches.

## 5. Ongoing monitoring

- Review each critical vendor's attestation **annually** (or on report renewal).
- Monitor vendor security advisories and status pages.
- Re-assess on material change (new data flows, incidents).

## 6. Offboarding

On termination, ensure data return/deletion per contract and revoke integrations, keys, and
access.

## 7. Records and review

Maintain the vendor register and collected attestations. _Current state: **gap** — no register or
collected reports exist yet (remediation P1-5)._ Reviewed at least annually.

---

_Owner: <name>. Approved by: <name>. Effective date: <date>. Next review: <date>._
