# Compliance — data protection & retention

## Data subject rights (GDPR / CCPA)

Implemented as server-authoritative Cloud Functions (audit-logged):

| Right                | Function                                           | Authorization                                  |
| -------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Access / portability | `exportUserData({ tenantId, uid? })`               | self, tenant_admin (own tenant), or superadmin |
| Erasure              | `deleteUserData({ tenantId, uid, confirm: true })` | superadmin + explicit `confirm`                |

**Export** returns the subject's member profile, enrollments, AI conversations,
and B2C customer record as JSON.

**Erasure** anonymizes PII on the member doc (email/displayName/avatar redacted,
`piiErasedAt` set), deletes AI conversation history (free-text, potentially
identifying), and disables the auth account. Non-identifying aggregates (XP,
completion counts) are preserved for tenant analytics integrity. Full account
removal from GCIP is an operator runbook step (logged in the audit trail).

> Erasure is irreversible and requires `confirm: true`. Per the working
> agreement, destructive operations are never run without explicit confirmation.

## Data retention

- xAPI statements (`lrs`), audit logs, and conversations have configurable
  retention; default = retain for the tenant's contract term, then purge via a
  scheduled job (deployment-time).
- Stripe idempotency log (`stripeEvents`) retained for reconciliation.

## Encryption

- **In transit**: TLS everywhere (Firebase/GCP default).
- **At rest**: Google-managed encryption (Firestore/Storage default); CMEK is
  available for compliance-sensitive tenants.

## Audit logging

Privileged actions (role changes, tenant lifecycle, data export/erasure) append
to an immutable audit log (`tenants/{t}/audit`, `platform/auditLog`), readable by
admins, written server-side only.

## Posture toward SOC 2 / FedRAMP (GovCon)

- Tenant isolation enforced at the data layer (rules) + auth layer (GCIP).
- Least-privilege custom claims; server-only privileged operations.
- Audit trail of administrative actions.
- Separate environments (dev/staging/prod) with separate Firebase projects.
- Path toward continuous control monitoring, access reviews, and data-residency
  configuration is documented for the compliance program (not code).
