# Go / No-Go report — shift-change burst readiness (TEMPLATE)

> **How to use.** Copy this file per release/event, fill every `<…>`, and attach
> the evidence (k6 summaries, the `reconcile.ts` table, console screenshots).
> The decision is **No-Go** if any **gating** row is unmet OR the reconciliation
> row is anything but PASS. Be honest: rows that were **not exercised** in this
> run must be recorded as such, not silently passed.

| Field                | Value                               |
| -------------------- | ----------------------------------- |
| Release / tag        | `<git tag or build id>`             |
| Date / operator      | `<YYYY-MM-DD>` / `<name>`           |
| Environment          | `<emulator / staging / production>` |
| Expected concurrency | `<device count, e.g. ~6,000>`       |
| Decision             | **`<GO / NO-GO>`**                  |

## 1. SLO table (brief §3)

Targets are the production SLOs for the burst window. The **Measured** /
**Source** columns record what this specific run actually exercised. Against the
emulator, several rows are **correctness-only** and the SLO itself is **not
proven** — mark those `n/a (not run)` and carry them to §3.

Targets below are the **ratified brief §3** SLOs at 6,000 concurrent.

| #   | SLO (target, brief §3)                                        | Gating | Measured | Source / evidence                          | Pass? |
| --- | ------------------------------------------------------------- | ------ | -------- | ------------------------------------------ | ----- |
| 1   | **Login / token issuance p95 ≤ 1.5 s** during the spike       | Yes    | `<…>`    | `loadtest:login-storm` k6 summary          | `<…>` |
| 2   | **Auth success rate ≥ 99.9%** (no spurious lockouts/timeouts) | Yes    | `<…>`    | `loadtest:login-storm` checks              | `<…>` |
| 3   | **Manifest + first lesson p95 ≤ 3 s cold**, instant cached    | Yes    | `<…>`    | `loadtest:content-pull` k6 summary         | `<…>` |
| 4   | **Offline sync flush 100% eventually consistent**             | Yes    | `<…>`    | `loadtest:sync-storm` checks + reconcile   | `<…>` |
| 5   | **Zero duplicate** records (replays collapse)                 | Yes    | `<…>`    | `loadtest:reconcile` (zero-dup)            | `<…>` |
| 6   | **Zero lost** attempts (projection == event fold)             | Yes    | `<…>`    | `loadtest:reconcile` (zero-loss)           | `<…>` |
| 7   | **API error rate (5xx) < 0.1%** under peak                    | Yes    | `<…>`    | k6 `http_req_failed` + Lane D logs         | `<…>` |
| 8   | **Data isolation: 0 cross-tenant/station leakage** under load | Yes    | `<…>`    | rules tests + reconcile tenant scoping     | `<…>` |
| 9   | **DB primary CPU / connections < 70%** (headroom)             | Yes    | `<…>`    | Cloud Monitoring (prod) — see §3 (not run) | `<…>` |
| 10  | **Recovery to baseline ≤ 60 s** after the spike               | Yes    | `<…>`    | Cloud Monitoring (prod) — see §3 (not run) | `<…>` |
| 11  | **No sustained backpressure** (429 decays, retries succeed)   | No     | `<…>`    | `callable.js` retryable counts + logs      | `<…>` |
| 12  | **Soak stable** (no drift / leak / duplicate growth)          | No     | `<…>`    | `loadtest:soak` + reconcile                | `<…>` |

> Rows 1–8 are exercisable for **correctness** against the emulator (latency
> numbers there are indicative, not prod SLOs). Rows 9–10 require a **deployed
> production project** and are carried to §3 as not-run.

## 2. Reconciliation result (the zero-dup / zero-loss gate)

Paste the `reconcile.ts` summary table. The run is **No-Go** unless this is PASS
for **every** enrollment.

| Field                     | Value               |
| ------------------------- | ------------------- |
| Enrollments reconciled    | `<…>`               |
| Enrollments PASS          | `<…>`               |
| Enrollments FAIL          | `<…>`               |
| Distinct events folded    | `<…>`               |
| Duplicate sends collapsed | `<…>`               |
| Exit code (`0` = pass)    | `<…>`               |
| **Reconciliation result** | **`<PASS / FAIL>`** |

```
<paste the "Reconciliation — events fold vs. enrollment projection" table here>
```

## 3. Not exercised here (honest gaps)

These were **NOT** validated by this run and must not be inferred from a green
emulator pass. They require a **deployed production project** and real load. See
`thundering-herd-runbook.md` and `observability-spec.md`.

| Item                                            | Why not run                                           | Where it must be proven                   |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| **Real ~6,000-concurrent prod load**            | Emulator is single-process / in-memory                | Prod project + real load generator        |
| **Firestore / Functions autoscale**             | Emulator does not autoscale                           | Prod, under real burst                    |
| **`minInstances` warm pools (cold-start tail)** | No standing instances in the emulator                 | Prod function deploy options + Monitoring |
| **CDN cache-hit ratio / edge latency**          | No CDN in front of the emulator                       | Prod Hosting/CDN + RUM                    |
| **App Check enforcement (`enforceAppCheck`)**   | No-op without a real site key + project               | Prod console enforcement                  |
| **Chaos / fault injection on live infra**       | Not safe/possible against the emulator                | Prod game-day / chaos run                 |
| **Cloud Monitoring alerts & dashboards firing** | No metrics pipeline against the emulator              | Prod Monitoring (see observability-spec)  |
| **Production project provisioning**             | Only `soteria-forge-dev` emulator target exists today | ROADMAP Phase 8                           |

## 4. Sign-off

| Role           | Name  | Decision       | Date  |
| -------------- | ----- | -------------- | ----- |
| Eng lead       | `<…>` | `<GO / NO-GO>` | `<…>` |
| Ops / SRE      | `<…>` | `<GO / NO-GO>` | `<…>` |
| Product / risk | `<…>` | `<GO / NO-GO>` | `<…>` |

**Final decision:** `<GO / NO-GO>` — `<one-line rationale, citing the gating row(s)>`
