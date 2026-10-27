# Runbook — tenant provisioning & lifecycle

All tenant lifecycle operations are **privileged** and run through the Forge API
(Django), never the client. Superadmin only unless stated.

## Provision a new tenant

`POST /api/tenants` with `{ id, name, plan?, adminEmail? }`:

1. Validates `id` is a DNS-safe label (it becomes the subdomain).
2. Creates the `Tenant` row (`status: active`) with default branding.
3. (Optional) when `adminEmail` is given, invites the first tenant admin and returns
   the invite link.

Re-running an active tenant id errors.

```bash
curl -X POST https://api.soteriaforge.com/api/tenants \
  -H "Authorization: Bearer $SUPERADMIN_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"id": "acme", "name": "Acme Corp", "plan": "pro", "adminEmail": "admin@acme.example"}'
```

### DNS / hosting (subdomain routing)

- Add `acme.soteriaforge.com` (wildcard `*.soteriaforge.com` recommended) to the
  Vercel project hosting the learner/admin apps.
- The apex + `www` route to the public storefront project.
- Custom domains: set `customDomain` on the tenant (`PATCH /api/tenants/{id}`) and add
  the host to `AssuranceEnvironment.customDomains`.

## Assign / change a member role

`PATCH /api/members/{id}/role` with `{ role }`:

- Tenant admin (own tenant) or superadmin acting in a tenant (`X-Forge-Tenant`).
- `superadmin` is never granted through the API: use `manage.py grant_superadmin`.
- Roles live in Postgres, so the change takes effect on the member's next request.

## Invite / deactivate

- `POST /api/members/invite` with `{ email, role, displayName? }` returns the member
  and an invite link (also emailed once email is configured).
- `PATCH /api/members/{id}/status` with `{ status: "deactivated" }` blocks sign-in
  and API access; `active` restores it.

## Suspend / resume

Suspension blocks sign-in and hides data **without deletion**:

1. `PATCH /api/tenants/{id}` with `{ status: "suspended" }`.
2. Resume with `{ status: "active" }`. Archival (`status: "archived"`) is the
   soft-delete state; hard deletion follows the data-deletion (GDPR/CCPA) workflow
   and requires explicit confirmation.

## Data export & deletion (compliance)

- Export: `GET /api/members/{id}/export` (self, tenant admin, superadmin).
- Deletion: `POST /api/members/{id}/erase` with `{ "confirm": true }` (superadmin):
  documented, confirmed, irreversible — never run without explicit product-owner
  sign-off.

## Verification (acceptance)

- [ ] New tenant resolves at `tenant.soteriaforge.com`.
- [ ] A learner in tenant A cannot read tenant B data (isolation tests + manual probe).
- [ ] `GET /api/me` shows the correct `role` + tenant after a role change.
- [ ] Suspended tenant blocks sign-in and hides data.
