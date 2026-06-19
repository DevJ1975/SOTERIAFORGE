# Access Control Policy

> **DRAFT — for <Company> to review/ratify; not an adopted policy.** Tailored to Soteria FORGE
> (GCIP, Firebase, multi-tenant). Reflects current code; replace placeholders before adoption.

## 1. Purpose and scope

Defines how access to the Soteria FORGE platform and customer data is granted, modified, reviewed,
and revoked. Covers end-user access (learners, instructors, tenant admins, B2C customers,
superadmins) and operator access (GCP/Firebase console, GitHub).

## 2. Identity and authentication

- **End users** authenticate through Google Cloud Identity Platform (GCIP), multi-tenant; tenancy
  is resolved from the subdomain (`libs/auth/src/lib/tenant-host.ts`,
  `libs/auth/src/lib/firebase.providers.ts`).
- **Sessions/claims** are represented by a verified ID token; the app parses role/tenant claims
  through a schema (`libs/auth/src/lib/claims.ts`, `libs/auth/src/lib/principal.store.ts`).
- **MFA:** _Planned — not yet enforced._ GCIP supports MFA; multi-factor SHALL be enforced for
  privileged roles (superadmin, tenant_admin) once configured (remediation P1-2).

## 3. Roles and least privilege

Roles are defined in `libs/shared/src/lib/constants.ts` (`ROLES`): `superadmin`, `tenant_admin`,
`instructor`, `learner`, `b2c_customer`.

- **superadmin** — platform operators; cross-tenant.
- **tenant_admin / instructor** — authoring roles within a single tenant (`AUTHORING_ROLES`).
- **learner / b2c_customer** — consumers.

Privilege rules (enforced in `apps/functions/src/lib/authz.ts`, `canManageRole`):

- superadmin may grant any role.
- tenant_admin may grant only `instructor`, `learner`, `b2c_customer`, `tenant_admin` **within
  their own tenant**, and **may never grant superadmin**.
- All other roles may not manage roles.

## 4. Authorization enforcement

- **Server-side (authoritative):** Firestore security rules (`firestore.rules`) enforce sign-in,
  role, and tenant scope (`inTenant()`, `isAuthoring()`, `isSuperadmin()`), with deny-by-default
  for anything unmatched. Storage is deny-by-default (`storage.rules`).
- **Client-side (convenience):** route guards (`libs/auth/src/lib/guards.ts`) gate navigation;
  they are not a security boundary on their own.

## 5. Provisioning and de-provisioning

- **Provisioning:** access is granted by Cloud Functions only — `provisionTenant`, `inviteMember`,
  `setUserRole` (`apps/functions/src/main.ts`). Clients can never write custom claims.
- **De-provisioning:** setting a member's status to `deactivated` (or deleting the member doc)
  clears that user's claims automatically via the `onMemberWritten` trigger
  (`apps/functions/src/lib/member-claims-sync.core.ts`); reactivation rebuilds them.
- **Operator access** (GCP/GitHub) follows joiner/mover/leaver: granted on hire, removed on
  departure. _Document the offboarding checklist; ensure GCIP user disablement._

## 6. Access reviews

Privileged access (superadmins; tenant*admins) SHALL be reviewed at least quarterly. \_Current
state: **gap** — no review process or tooling yet (remediation P2-2).*

## 7. Public/anonymous access

The only intentionally public data is the B2C storefront catalog
(`/b2c/store/catalog/{productId}`, `allow read: if true` in `firestore.rules`). All other data
requires authentication and matching tenant/role.

## 8. Enforcement and exceptions

Violations are handled per the Information Security Policy. Exceptions require Security Owner
approval and a remediation date.

---

_Owner: <name>. Approved by: <name>. Effective date: <date>. Next review: <date>._
