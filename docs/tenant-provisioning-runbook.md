# Runbook — tenant provisioning & lifecycle

All tenant lifecycle operations are **privileged** and run through Cloud
Functions (Admin SDK), never the client. Superadmin only.

## Provision a new tenant

`provisionTenant({ tenantId, name, plan?, adminEmail? })` (callable):

1. Validates `tenantId` is a DNS-safe label (it becomes the subdomain).
2. Creates a **GCIP Identity Platform tenant** (true isolation).
3. Seeds `/tenants/{tenantId}` with `status: active`, `gcipTenantId`, default
   branding, and `daily`/`weekly`/`allTime` leaderboard docs.
4. Increments `platform/config.tenantCount`.
5. (Optional) invite the first tenant admin → `setMemberRole`.

Idempotent on `tenantId` (re-running an active tenant errors; an archived
tenant may be re-provisioned).

```bash
# via Firebase callable (example using the emulator / a superadmin token)
firebase functions:shell
> provisionTenant({ tenantId: 'acme', name: 'Acme Corp', plan: 'pro' })
```

### DNS / hosting (subdomain routing)

- Add `acme.soteriaforge.com` (wildcard `*.soteriaforge.com` recommended) to the
  Vercel project hosting the learner/admin apps.
- The apex + `www` route to the B2C storefront project.
- Custom domains (Phase 1+) are added to `ForgeEnvironment.customDomains`.

## Assign / change a member role

`setMemberRole({ tenantId, uid, role })`:

- Superadmin (any tenant) or tenant_admin (own tenant). Only superadmin may mint
  `superadmin`.
- Sets custom claims on the **tenant's GCIP pool** and updates the member doc.
- The user must refresh their ID token for new claims to take effect
  (`AuthService.refreshClaims(true)`).

## Suspend / resume

Suspension disables auth and hides data **without deletion**:

1. Set `/tenants/{tenantId}.status = 'suspended'` (server-side).
2. Disable the GCIP tenant's sign-in (Identity Platform).
3. Resume reverses both. Archival (`status: 'archived'`) is the soft-delete
   state; hard deletion follows the data-deletion (GDPR/CCPA) workflow and
   requires explicit confirmation.

## Data export & deletion (compliance)

- Export: tenant-scoped Firestore export + the tenant's xAPI statements (CSV /
  xAPI). Run server-side.
- Deletion: documented, confirmed, irreversible — never run without explicit
  product-owner sign-off.

## Verification (acceptance)

- [ ] New tenant resolves at `tenant.soteriaforge.com`.
- [ ] A learner in tenant A cannot read tenant B data (rules test + manual probe).
- [ ] Claims carry the correct `role` + `tenantId` after `setMemberRole`.
- [ ] Suspended tenant blocks sign-in and hides data.
