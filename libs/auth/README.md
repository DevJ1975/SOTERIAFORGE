# @assurance/auth

Authentication, GCIP multi-tenancy, custom-claim helpers, and route guards.

## Provided

- `FORGE_ENV` — injection token carrying Firebase config + `rootDomain` + GCIP map.
- `TenantService` — resolves the active tenant from the host (subdomain strategy)
  and exposes `tenantId`, `isB2c`, `gcipTenantId` as signals.
- `AuthService` — Firebase Auth facade. Stamps `auth.tenantId` with the active
  GCIP tenant before sign-in, parses + validates custom claims into signals.
- `claims.ts` — `isSuperadmin`, `hasRole`, `canAuthor`, `canAccessTenant`,
  `hasEntitlement`, `parseClaims`.
- Guards — `authGuard`, `roleGuard(...roles)`, `superadminGuard`, `tenantGuard`.

## Isolation model

- **GCIP**: each tenant is a first-class Identity Platform tenant. `AuthService`
  binds `auth.tenantId` to the tenant's GCIP id before authenticating; superadmin
  authenticates against the project-level pool (`tenantId = null`).
- Guards are the **client-side** half of isolation. The authoritative half is in
  Firestore/Storage security rules and Cloud Functions claim validation.
- Custom claims are **only** set by Cloud Functions, never the client.
