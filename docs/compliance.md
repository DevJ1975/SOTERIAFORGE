# Compliance — data protection & retention

## Data subject rights (GDPR / CCPA)

Implemented as server-authoritative API endpoints (audit-logged):

| Right                | Endpoint                                       | Authorization                                  |
| -------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Access / portability | `GET /api/members/{id}/export`                 | self, tenant_admin (own tenant), or superadmin |
| Erasure              | `POST /api/members/{id}/erase {confirm: true}` | superadmin + explicit `confirm`                |

**Export** returns the subject's member profile, enrollments and related records as
JSON.

**Erasure** anonymizes PII on the member record (email and display name replaced),
revokes outstanding one-time tokens, and deactivates the account so it can no longer
sign in. The AI coach keeps no chat history (transient). Non-identifying aggregates
(XP, completion counts) are preserved for tenant analytics integrity.

> Erasure is irreversible and requires `confirm: true`. Per the working
> agreement, destructive operations are never run without explicit confirmation.

## Data retention

- xAPI statements, audit logs, and conversations have configurable
  retention; default = retain for the tenant's contract term, then purge via a
  scheduled job (deployment-time).

## Encryption

- **In transit**: TLS everywhere (Railway and Vercel edge).
- **At rest**: encrypted volumes for Postgres and the bucket (provider-managed);
  customer-managed keys are a follow-up for compliance-sensitive tenants.

## Audit logging

Privileged actions (role changes, tenant lifecycle, data export/erasure) append
to an append-only audit log (`backend/apps/audit`), written server-side only.

## Posture toward SOC 2 / FedRAMP (GovCon)

- Tenant isolation enforced at the data layer (Postgres row-level security) + API permissions.
- Least-privilege roles; server-only privileged operations.
- Audit trail of administrative actions.
- Separate environments (dev/staging/prod) with separate Railway environments.
- Path toward continuous control monitoring, access reviews, and data-residency
  configuration is documented for the compliance program (not code).
