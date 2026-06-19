# Go / No-Go report — shift-change burst readiness (TEMPLATE)

> **How to use.** Copy this file per release/event, fill every `<…>`, and attach
> the evidence (k6 summaries, the `reconcile.ts` table, console screenshots).
> The decision is **No-Go** if any **gating** row is unmet OR the reconciliation
> row is anything but PASS. Be honest: rows that were **not exercised** in this
> run must be recorded as such, not silently passed.

| Field            | Value                                  |
| ---------------- | -------------------------------------- |
| Release / tag    | `<git tag or build id>`                |
| Date / operator  | `<YYYY-MM-DD>` / `<name>`              |
| Environment      | `<emulator | staging | production>`    |
| Expected concurrency | `<device count, e.g. ~6,000>`      |
| Decision         | **`<GO | NO-GO>`**                     |

## 1. SLO table (brief §3)

Targets are the production SLOs for the burst window. The **Measured** /
**Source** columns record what this specific run actually exercised. Against the
emulator, several rows are **correctness-only** and the SLO itself is **not
proven** — mark those `n/a (not run)` and carry them to §3.

| # | SLO (target)                                                      | Gating | Measured | Source / evidence                         | Pass? |
| - | ----------------------------------------------------------------- | ------ | -------- | ----------------------------------------- | ----- |
| 1 | **Auth p95 < 2 s** during the spike                               | Yes    | `<…>`    | `loadtest:login-storm` k6 summary         | `<…>` |
| 2 | **Progress-write success rate ≥ 99.9%** (no lost events)          | Yes    | `<…>`    | `loadtest:sync-storm` checks + reconcile  | `<…>` |
| 3 | **Progress-write p95 < 2 s** under burst                          | Yes    | `<…>`    | `loadtest:sync-storm` k6 summary          | `<…>` |
| 4 | **Zero duplicate enrollment effects** (replays collapse)          | Yes    | `<…>`    | `loadtest:reconcile` (zero-dup)           | `<…>` |
| 5 | **Zero lost events** (projection == event fold)                   | Yes    | `<…>`    | `loadtest:reconcile` (zero-loss)          | `<…>` |
| 6 | **Content/enrollment read p95 < 2 s**                            | Yes    | `<…>`    | `loadtest:content-pull` k6 summary        | `<…>` |
| 7 | **Error rate < 0.1%** (5xx / rules-deny anomalies)               | Yes    | `<…>`    | k6 `http_req_failed` + logs               | `<…>` |
| 8 | **Cold-start tail bounded** (warm pool absorbs first wave)        | Yes    | `<…>`    | Cloud Monitoring (prod) — see §3          | `<…>` |
| 9 | **No sustained backpressure** (429 rate decays, retries succeed)  | No     | `<…>`    | `callable.js` retryable counts + logs     | `<…>` |
| 10| **Soak stable** (no drift / leak / duplicate growth over time)    | No     | `<…>`    | `loadtest:soak` + reconcile               | `<…>` |

> Adjust target numbers to the ratified brief §3 values before publishing. The
> rows above encode the **shape** of the SLO set (latency, success, zero-dup,
> zero-loss, error rate, cold-start, backpressure, soak).

## 2. Reconciliation result (the zero-dup / zero-loss gate)

Paste the `reconcile.ts` summary table. The run is **No-Go** unless this is PASS
for **every** enrollment.

| Field                         | Value   |
| ----------------------------- | ------- |
| Enrollments reconciled        | `<…>`   |
| Enrollments PASS              | `<…>`   |
| Enrollments FAIL              | `<…>`   |
| Distinct events folded        | `<…>`   |
| Duplicate sends collapsed     | `<…>`   |
| Exit code (`0` = pass)        | `<…>`   |
| **Reconciliation result**     | **`<PASS | FAIL>`** |

```
<paste the "Reconciliation — events fold vs. enrollment projection" table here>
```

## 3. Not exercised here (honest gaps)

These were **NOT** validated by this run and must not be inferred from a green
emulator pass. They require a **deployed production project** and real load. See
`thundering-herd-runbook.md` and `observability-spec.md`.

| Item                                                | Why not run                                            | Where it must be proven                |
| --------------------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| **Real ~6,000-concurrent prod load**                | Emulator is single-process / in-memory                 | Prod project + real load generator     |
| **Firestore / Functions autoscale**                 | Emulator does not autoscale                             | Prod, under real burst                 |
| **`minInstances` warm pools (cold-start tail)**     | No standing instances in the emulator                  | Prod function deploy options + Monitoring |
| **CDN cache-hit ratio / edge latency**              | No CDN in front of the emulator                         | Prod Hosting/CDN + RUM                 |
| **App Check enforcement (`enforceAppCheck`)**       | No-op without a real site key + project                | Prod console enforcement               |
| **Chaos / fault injection on live infra**           | Not safe/possible against the emulator                  | Prod game-day / chaos run              |
| **Cloud Monitoring alerts & dashboards firing**     | No metrics pipeline against the emulator                | Prod Monitoring (see observability-spec) |
| **Production project provisioning**                 | Only `soteria-forge-dev` emulator target exists today   | ROADMAP Phase 8                        |

## 4. Sign-off

| Role            | Name      | Decision        | Date     |
| --------------- | --------- | --------------- | -------- |
| Eng lead        | `<…>`     | `<GO | NO-GO>`  | `<…>`    |
| Ops / SRE       | `<…>`     | `<GO | NO-GO>`  | `<…>`    |
| Product / risk  | `<…>`     | `<GO | NO-GO>`  | `<…>`    |

**Final decision:** `<GO | NO-GO>` — `<one-line rationale, citing the gating row(s)>`
