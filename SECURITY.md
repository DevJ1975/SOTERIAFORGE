# Security

## Reporting a vulnerability

Email **security@trainovations.com** with details and reproduction steps. Do not
open public issues for security reports. We aim to acknowledge within 2 business
days.

## Security model (summary)

Soteria Assurance is multi-tenant; **tenant isolation** is the central invariant.

### Identity & tenancy

- **Django-native sign-in** — email and password against `/api/auth/*`; short-lived
  access tokens with refresh, password reset by one-time emailed links.
- **Roles and tenant membership** live in Postgres (`Member`) and change only through
  the audited API, never by clients. A role change takes effect immediately.
- A superadmin may act inside a tenant only via the `X-Forge-Tenant` header, and every
  such action is tenant-scoped like any other.

### Authorization (defense in depth)

1. **Tenant-scoped querysets + Postgres row-level security** — every tenant-owned
   table carries `tenant_id`; the API sets the tenant per request and the database
   enforces it again, so a missing filter cannot leak rows. The runtime database
   role is not a superuser (superusers skip RLS). Covered by the isolation tests
   in `backend/tests`.
2. **DRF permissions** — every privileged endpoint checks the caller's role; the
   server is authoritative for scores (anti-cheat), XP, completion and AI
   retrieval scope.
3. **Client route guards** — convenience layer (`authGuard`, `roleGuard`,
   `tenantGuard`, `superadminGuard`); never the sole control.

### Tenant isolation guarantees

- **Data**: every tenant row is scoped by `tenant_id`; no query crosses tenants
  (RLS-enforced).
- **AI tutor**: retrieval reads only the caller's tenant sources and chunks; the
  authenticated tenant is authoritative — no cross-tenant grounding.
- **External content (Unity/cmi5)**: the AU's xAPI auth token is an HMAC-signed,
  tenant-scoped token; statements are stamped with the token's tenant, so an AU
  cannot post into another tenant.

### Credentials

- **Secrets** are Railway service variables (`DJANGO_SECRET_KEY`, database and
  storage credentials, `LIVEKIT_*`, SMTP); never committed.
- **Media** is served through short-lived signed URLs from a private bucket.

### Auditing & compliance

- Append-only **audit log** of privileged actions, server-written.
- **GDPR/CCPA**: member data export (self, tenant admin, superadmin) and
  erasure (superadmin + explicit confirm). See `docs/compliance.md`.

## Pre-deployment security checklist

- [ ] `DJANGO_DEBUG=false`, strong `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` set.
- [ ] Runtime database role is the non-superuser `forge_app` (RLS enforced).
- [ ] Secrets set as Railway variables; none in source or env files.
- [ ] `AUTH_COOKIE_SAMESITE` matches the deployment topology (see docs/todo.md).
- [ ] Isolation tests green in CI; manual cross-tenant probe fails.
- [ ] Separate Railway environments per stage (dev/staging/prod).
- [ ] Storage objects served via short-lived signed URLs; bucket not public.
- [ ] Dependency scanning + `npm audit` / `pip-audit` in CI; Dependabot enabled.
- [ ] SOC 2 / FedRAMP-adjacent controls reviewed for GovCon tenants.
