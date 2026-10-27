# @assurance/tenant

Phase 1 multi-tenant feature lib: client wrappers over the tenant admin
Forge API endpoints, plus runtime white-labeling.

- `TenantAdminService` — `provisionTenant`, `setTenantStatus` (suspend/resume/archive).
- `MemberAdminService` — `listMembers`, `inviteMember`, `setMemberRole`, `setMemberStatus`, `exportMember`.
- `BrandingService` — `getBranding`, `updateBranding`.
- `ReportsApi` — `enrollments`.
- `provideTenantTheme()` — an app initializer that resolves the active tenant
  (subdomain), loads its branding from the Forge API, and applies it via the
  `@assurance/ui` `ThemeService` (CSS custom properties). Browser only.

All mutations are **server-authoritative** (role checks in Django); these
wrappers never set claims/branding/entitlements directly.
