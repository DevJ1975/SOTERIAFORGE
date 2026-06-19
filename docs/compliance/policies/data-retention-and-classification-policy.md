# Data Retention and Classification Policy

> **DRAFT — for <Company> to review/ratify; not an adopted policy.** Tailored to Soteria FORGE
> (Firestore, multi-tenant, B2C). Reflects current data model; replace placeholders and confirm
> retention windows with Legal before adoption.

## 1. Purpose and scope

Defines how data in Soteria FORGE is classified, protected, retained, and disposed of. Applies to
all data stored in Firestore, Firebase Storage, GCIP, and logs.

## 2. Data classification

| Class            | Examples in Soteria FORGE                                                                                | Handling                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Public**       | B2C storefront catalog (`/b2c/store/catalog`)                                                            | World-readable by design (`firestore.rules`). No confidential content.  |
| **Internal**     | Tenant metadata, course/module structure                                                                 | Tenant-scoped; readable within the tenant only.                         |
| **Confidential** | Member PII (email, displayName — `member` schema), enrollment progress/scores, B2C customer/entitlements | Tenant- or owner-scoped, deny-by-default; encrypted at rest/in transit. |
| **Secret**       | Server credentials (Stripe keys, AI keys), GCP service-account keys                                      | Secret Manager only; never in the repo or client bundles.               |

PII today is primarily member `email`/`displayName` (`libs/shared/src/lib/schemas/tenant.ts`) and
B2C customer records (`libs/shared/src/lib/schemas/commerce.ts`).

## 3. Protection by class

- **Confidential:** tenant isolation + deny-by-default rules (`firestore.rules`); owner-only B2C
  customer docs (`/b2c/store/customers/{uid}`); encryption at rest (GCP default) and in transit
  (TLS).
- **Secret:** Secret Manager; least-privilege IAM. _No server secrets exist in the repo yet._

## 4. Retention

Define retention windows per data type (examples — confirm with Legal/contracts):

| Data                                     | Suggested retention                                |
| ---------------------------------------- | -------------------------------------------------- |
| Active tenant & member records           | Life of the customer relationship                  |
| Enrollment/progress records              | Per contract; consider training-record obligations |
| B2C customer & purchase/entitlement data | Per tax/financial obligations (e.g. 7 years)       |
| Audit logs (once implemented)            | ≥ 1 year (align to the audit observation period)   |
| Application/operational logs             | Per Cloud Logging retention configuration          |
| Backups / PITR                           | Per BC/DR Plan                                     |

_Current state: retention is **not enforced** — there are no scheduled deletion jobs and audit
logs/backups do not exist yet (remediation P0-2, P0-3, P2-3)._

## 5. Disposal and data-subject requests

- Deletion SHALL be honored for contractual/legal data-subject requests.
- Deactivation already clears a member's access claims
  (`apps/functions/src/lib/member-claims-sync.core.ts`), but **does not delete their data** — a
  separate, audited deletion job is required (remediation P2-3).
- Disposal includes the document, derived/denormalized copies (e.g. leaderboard entries), Storage
  assets, and backups per their retention.

## 6. Data residency

Firestore/GCP region selection determines residency; document the chosen region(s) once production
projects are provisioned (remediation P0-1).

## 7. Review

Reviewed at least annually and when the data model materially changes.

---

_Owner: <name>. Approved by: <name>. Effective date: <date>. Next review: <date>._
