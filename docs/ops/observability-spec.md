# Observability spec — SLOs, logs, metrics, alerts, dashboards

> **Scope & honesty.** This is the **Cloud Monitoring configuration spec** for the
> shift-change burst: the SLOs to watch, the structured log fields the platform
> emits, the log-based metrics to derive from them, the alert policies, and the
> dashboard mapping. The log emitter (`apps/functions/src/lib/logger.ts`, Lane D)
> and the client telemetry hook (`@forge/shared` `emit`, Lane A) **exist in code**.
> Everything downstream of the log line — log-based metrics, alert policies,
> dashboards, notification channels — requires a **deployed production project
> with Cloud Monitoring** and is **NOT created or fired in this environment**.
> Treat the gcloud/console config below as the **intended state to apply in prod**,
> labelled accordingly. The emulator validates that the right log lines are
> emitted (structured JSON), not that any metric or alert fires.

## 1. SLOs (what we measure)

Mirrors the go/no-go SLO table (`go-no-go-report-template.md` §1). Each SLO maps
to a signal below.

| SLO                            | Signal source                                   |
| ------------------------------ | ----------------------------------------------- |
| Auth p95 < 2 s                 | GCIP request latency (prod) / k6 (run)          |
| Progress-write success ≥ 99.9% | `forge_progress_write` log-based metric (§3)    |
| Progress-write p95 < 2 s       | `latencyMs` distribution metric (§3)            |
| Zero-dup / zero-loss           | `reconcile.ts` gate (run) + drift metric (§3)   |
| Read p95 < 2 s                 | Firestore read latency (prod) / k6 (run)        |
| Error rate < 0.1%              | `outcome="error"` counter (§3)                  |
| Cold-start tail bounded        | Function instance-count / startup metric (prod) |
| Backpressure decays            | `outcome="denied"` + `429` counter (§3)         |

## 2. Structured log labels (what Lane D emits)

`apps/functions/src/lib/logger.ts` writes **one JSON line per event** to
stdout/stderr. Cloud Logging parses it into `jsonPayload`, lifting `severity` and
`message` and exposing every other field as a filterable label. The stable label
set:

| Field       | Type                                  | Use                                                |
| ----------- | ------------------------------------- | -------------------------------------------------- |
| `severity`  | `DEBUG\|INFO\|WARNING\|ERROR`         | Lifted to the log entry severity.                  |
| `message`   | string                                | Human-readable line.                               |
| `function`  | string                                | Emitting function/trigger (group/filter by).       |
| `actorUid`  | string                                | Acting user (when known).                          |
| `tenantId`  | string                                | Tenant scope (per-tenant slicing).                 |
| `outcome`   | `ok\|denied\|error\|ignored` (coarse) | **Primary metric dimension** (success/deny/error). |
| `latencyMs` | number                                | Operation duration → latency distribution metric.  |
| _(other)_   | any non-sensitive structured context  | e.g. `idempotencyKey`, `clientSeq`, `kind`.        |

Client-side, `@forge/shared` `emit(name, fields)` (Lane A) routes through a
swappable sink; in prod the learner app installs a Cloud Logging / RUM sink to
surface stagger/backoff/flush telemetry (queue depth, retry counts, flush
duration). Default sink is a no-op (no noise in tests).

> Example emitted line (illustrative):
> `{"severity":"INFO","message":"progress event applied","function":"applyProgress","tenantId":"atl-airport","actorUid":"…","outcome":"ok","latencyMs":42,"kind":"lesson_completed","clientSeq":5}`

## 3. Log-based metrics (derive in prod Cloud Monitoring)

Counter and distribution metrics derived from the log labels. **Not created
here** — apply with `gcloud logging metrics create` (or Terraform) on the prod
project. Names below are the proposed metric ids.

| Metric (id)                   | Type         | Filter (Logging query)                                                        | Labels kept           |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------- | --------------------- |
| `forge_progress_write`        | Counter      | `jsonPayload.function="applyProgress"`                                        | `outcome`, `tenantId` |
| `forge_progress_write_errors` | Counter      | `… AND jsonPayload.outcome="error"`                                           | `tenantId`            |
| `forge_progress_denied`       | Counter      | `… AND jsonPayload.outcome="denied"` (rate-limit / guard rejects)             | `tenantId`            |
| `forge_progress_latency`      | Distribution | `jsonPayload.function="applyProgress"`, value `jsonPayload.latencyMs`         | `tenantId`            |
| `forge_callable_backpressure` | Counter      | `severity>=WARNING AND jsonPayload.outcome="denied"` (429/resource-exhausted) | `function`            |
| `forge_auth_errors`           | Counter      | GCIP audit/error logs (prod)                                                  | —                     |

> **Reconciliation drift signal.** The authoritative zero-dup/zero-loss check is
> `tools/load-test/reconcile.ts` (CI gate, exit non-zero on mismatch). In prod,
> a scheduled reconcile job can emit a `forge_reconcile_mismatch` counter so drift
> alerts (§4) fire on any divergence between the event fold and the projection.

## 4. Alert policies (apply in prod)

**Not created here.** Apply with `gcloud alpha monitoring policies create` /
console / Terraform. Thresholds are starting points — tune against a real load
test.

| Alert                     | Condition (on the §3 metric)                                          | Severity | Notify             |
| ------------------------- | --------------------------------------------------------------------- | -------- | ------------------ |
| Progress-write error rate | `forge_progress_write_errors / forge_progress_write > 0.1%` for 5 min | Page     | on-call            |
| Progress-write latency    | `forge_progress_latency` p95 > 2 s for 5 min                          | Page     | on-call            |
| Sustained backpressure    | `forge_callable_backpressure` rate not decaying over 10 min           | Warn     | ops channel        |
| Auth error spike          | `forge_auth_errors` > baseline×3 for 5 min                            | Page     | on-call            |
| **Reconciliation drift**  | `forge_reconcile_mismatch > 0` (any mismatch)                         | Page     | on-call + eng lead |
| Cold-start tail           | function startup latency p99 above warm-pool target for 10 min        | Warn     | ops channel        |

## 5. Dashboard mapping (apply in prod)

A single "Shift-change burst" dashboard, **not built here**. Suggested tiles, each
bound to a §1 SLO / §3 metric:

| Tile                                 | Bound to                                              |
| ------------------------------------ | ----------------------------------------------------- |
| Progress-write success rate (gauge)  | `forge_progress_write` by `outcome`                   |
| Progress-write p95 latency (line)    | `forge_progress_latency`                              |
| Error rate (line)                    | `forge_progress_write_errors` / total                 |
| Backpressure / 429s (line)           | `forge_callable_backpressure`                         |
| Auth latency + errors (line)         | GCIP metrics + `forge_auth_errors`                    |
| Function instance count / cold start | function autoscale + startup metrics (warm-pool view) |
| Reconciliation status (single-stat)  | `forge_reconcile_mismatch` (0 = green)                |
| Per-tenant write volume (heatmap)    | `forge_progress_write` by `tenantId`                  |

## 6. What this environment actually validates

- **Validated (emulator / run):** the platform emits **structured JSON logs** with
  the documented label set; the client telemetry hook routes through a swappable
  sink; the **reconciliation gate** runs and fails correctly on any divergence.
- **Not validated (needs prod):** log-based metric creation, alert policies
  firing, dashboards rendering, notification channels, cold-start/instance metrics,
  GCIP/Firestore service-side latency. These are the spec above, to be applied on
  the production project (ROADMAP Phase 8) and re-checked against a real load test.
