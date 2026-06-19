# Business Continuity and Disaster Recovery Plan

> **DRAFT — for <Company> to review/ratify; not an adopted policy.** Tailored to Soteria FORGE
> (Firebase/GCP). **Important:** the platform currently runs against the **emulator suite** with no
> provisioned production project and **no backups** — so most of this plan is aspirational until
> the prerequisite infrastructure exists (remediation P0-1, P0-2). Replace placeholders before
> adoption.

## 1. Purpose and scope

Ensures Soteria FORGE can continue operating and recover data/services after a disruption
(infrastructure outage, data corruption, accidental deletion, security incident). Covers Firestore
data, GCIP identities, Firebase Hosting, Cloud Functions, and the GitHub source of truth.

## 2. Current state (honest baseline)

- **No production Firebase project** is provisioned; apps default to local emulators
  (`.firebaserc` → demo `soteria-forge-dev`; `libs/auth/src/lib/firebase.providers.ts`).
- **No backups or Point-in-Time Recovery** are configured.
- **No monitoring/alerting** to detect outages.
- Therefore RTO/RPO are currently **undefined and unmet**. This plan defines the target state.

## 3. Recovery objectives (targets — to be ratified)

| Tier      | Example data/service                        | Target RPO         | Target RTO      |
| --------- | ------------------------------------------- | ------------------ | --------------- |
| Critical  | Firestore (tenant, member, enrollment data) | ≤ 24h (PITR finer) | ≤ 4h            |
| Critical  | GCIP identities                             | Managed by GCP     | Managed by GCP  |
| Important | Hosting (static apps)                       | Re-deployable      | ≤ 1h (redeploy) |
| Important | Cloud Functions                             | Re-deployable      | ≤ 1h (redeploy) |

Hosting and Functions are **rebuildable from source** (`npm ci` + `nx build` + `firebase deploy`),
so their recovery depends mainly on the GitHub repo being intact.

## 4. Backups (target — not yet implemented)

- Enable **Firestore PITR** and scheduled managed exports to a separate backup bucket with
  retention (remediation P0-2).
- Protect the GitHub repository (it is the source of truth for code, rules, and config); ensure
  more than one admin and consider an offline mirror.
- **Test restores** at least annually and record the result (a backup is unproven until restored).

## 5. Continuity strategy

- Rely on GCP/Firebase managed high availability for compute/storage (subservice control).
- Keep deployments reproducible and environment config externalized (per-env projects —
  remediation P0-1, P1-7) so the platform can be re-deployed cleanly.

## 6. Disaster scenarios and response

| Scenario                            | Response                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Accidental data deletion/corruption | Restore via Firestore PITR/export to a point before the event; verify with rules tests.         |
| Regional/provider outage            | Follow GCP guidance; communicate status; fail forward when the region recovers.                 |
| Compromised credentials/security    | Invoke the Incident Response Plan; rotate secrets; restore clean data if integrity is affected. |
| Source/CI loss                      | Restore from GitHub; rebuild and redeploy from `package-lock.json`.                             |

## 7. Communications

Maintain a way to inform customers of major incidents (status page / direct comms). Define contacts
in the Incident Response Plan.

## 8. Testing and maintenance

This plan SHALL be tested (including a restore drill) at least annually once backups exist, and
updated after material changes or incidents.

---

_Owner: <name>. Approved by: <name>. Effective date: <date>. Next review: <date>._
