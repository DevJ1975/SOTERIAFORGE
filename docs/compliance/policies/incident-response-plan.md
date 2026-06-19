# Incident Response Plan

> **DRAFT — for <Company> to review/ratify; not an adopted policy.** Tailored to the Soteria FORGE
> stack. This plan has **not** been exercised; a tabletop test is required before relying on it
> (remediation P1-6). Replace placeholders before adoption.

## 1. Purpose and scope

Defines how <Company> detects, responds to, and recovers from security incidents affecting the
Soteria FORGE platform (GCP/Firebase, GitHub, customer data). An "incident" is any event that
compromises, or threatens to compromise, the confidentiality, integrity, or availability of the
platform or customer data.

## 2. Roles

- **Incident Commander (<name/role>):** coordinates the response and decisions.
- **Security Owner (<name/role>):** assesses severity, owns communications and post-mortem.
- **Engineering on-call (<name/role>):** investigates and remediates.
- **Communications/Legal (<name/role>):** customer/regulatory notification.

_(Define an on-call rotation; today there is none.)_

## 3. Severity levels

| Severity | Examples                                                                | Target response  |
| -------- | ----------------------------------------------------------------------- | ---------------- |
| SEV-1    | Confirmed customer-data breach; cross-tenant data exposure; auth bypass | Immediate        |
| SEV-2    | Privilege escalation, exposed secret, significant availability loss     | < 1 hour         |
| SEV-3    | Suspicious activity, single-tenant minor issue, dependency CVE in use   | < 1 business day |

## 4. Detection sources

- **Today:** unhandled function errors via `console.error` (`apps/functions/src/main.ts`);
  GitHub notifications; manual reports.
- **Planned (gap):** Cloud Logging/Error Reporting alerts, audit logs of privileged actions, and a
  `security@<company>` external reporting inbox (remediation P0-3, P1-1, P1-6). Until these exist,
  detection is largely manual.

## 5. Response process

1. **Identify & declare.** Anyone who suspects an incident notifies the Security Owner and opens an
   incident record (time, scope, severity).
2. **Contain.** Examples for this stack:
   - Revoke/clear a compromised principal's access: deactivate the member doc (triggers
     `setCustomClaims(uid, null)` via `onMemberWritten`) or disable the GCIP user.
   - Tighten or roll back `firestore.rules` / `storage.rules` and redeploy.
   - Rotate exposed secrets (Secret Manager / Stripe / GCP keys) and invalidate sessions.
   - Suspend a tenant (set tenant `status`) or disable a Cloud Function if abused.
3. **Eradicate.** Remove the root cause (patch code, fix rules, remove malicious data).
4. **Recover.** Restore from backup/PITR if data integrity is affected (see BC/DR Plan); verify
   tenant isolation tests pass (`firestore.rules.spec.ts`).
5. **Notify.** Per contractual/legal obligations; coordinate customer comms.
6. **Post-incident review.** Within 5 business days: timeline, root cause, corrective actions added
   to `docs/compliance/remediation-backlog.md`.

## 6. Evidence preservation

Preserve relevant logs (Cloud Logging, GitHub audit log), affected documents, and the incident
timeline. _Note: an immutable audit trail of privileged actions does not yet exist (gap P0-3) — this
limits forensic capability today._

## 7. Communications

- Internal: incident channel + Incident Commander updates.
- External: customers/regulators per agreements; provide a single point of contact.

## 8. Testing and maintenance

This plan SHALL be tested via a tabletop exercise at least annually and updated after each
incident. _Current state: not yet tested._

---

_Owner: <name>. Approved by: <name>. Effective date: <date>. Next review: <date>._
