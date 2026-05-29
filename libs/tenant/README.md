# @forge/tenant

Phase 1 multi-tenant feature lib: client wrappers over the privileged tenant
Cloud Functions, plus runtime white-labeling.

- `TenantAdminService` — `provisionTenant`, `setTenantStatus` (suspend/resume/archive).
- `MemberAdminService` — `inviteMember`, `setMemberRole`, `deactivateMember`.
- `BrandingService` — `updateBranding`.
- `provideTenantTheme()` — an app initializer that resolves the active tenant
  (subdomain), loads its branding from Firestore, and applies it via the
  `@forge/ui` `ThemeService` (CSS custom properties). Runs on the server for SSR.

All mutations are **server-authoritative** (Admin SDK behind auth checks); these
wrappers never set claims/branding/entitlements directly.
