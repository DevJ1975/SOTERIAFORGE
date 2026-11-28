# @assurance/auth

Authentication against the Forge API (Django), tenant resolution, claim helpers, and route guards.

## Provided

- `ASSURANCE_ENV` — injection token carrying `apiBaseUrl`, `rootDomain` and optional custom domains.
- `TenantService` — resolves the active tenant from the host (subdomain strategy)
  and exposes `tenantId`, `isB2c` as signals.
- `AuthService` / `ForgeSession` — sign-in, refresh and sign-out against `/api/auth/*`;
  parses + validates claims into signals.
- `claims.ts` — `isSuperadmin`, `hasRole`, `canAuthor`, `canAccessTenant`,
  `hasEntitlement`, `parseClaims`.
- Guards — `authGuard`, `roleGuard(...roles)`, `superadminGuard`, `tenantGuard`.

## Isolation model

- Guards are the **client-side** half of isolation. The authoritative half is the
  Django API: tenant-scoped querysets and Postgres row-level security.
- Roles and tenant membership are only ever set by the API, never the client.
