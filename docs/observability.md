# Observability

## Backend (Django API)

- **Structured logging** via the standard `logging` module to stdout, collected by
  Railway logs. Privileged endpoints log actor, tenant, and outcome; sensitive
  values are never logged.
- **Error reporting**: uncaught errors go to Sentry when `SENTRY_DSN` is set; DRF
  returns typed error bodies (`{"detail": ...}`) to clients.
- **Audit trail**: privileged actions also append to the immutable audit log
  (see `docs/compliance.md`) — distinct from operational logs.

## Frontend (Angular apps)

- `@assurance/ui` provides `provideObservability(sink?)`: a custom Angular
  `ErrorHandler` that forwards uncaught errors + telemetry events to a pluggable
  `TelemetrySink` (default: console). Apps swap in a **Sentry** sink at deployment by providing a `TelemetrySink` implementation —
  the app code never changes.
- **Web Vitals**: SSR + incremental hydration (storefront) and route-level
  `@defer` for heavy widgets (players/games) keep LCP/TBT low; build budgets fail
  CI on regressions.

## Dashboards & alerting (deployment-time)

- Railway metrics and Sentry dashboards: API latency/error rate, Postgres
  connections and slow queries, Redis memory.
- Alerts: API error-rate and latency thresholds, failed deploys, repeated
  authentication lockouts, budget overruns.

## What ships vs. what's wired at deploy

| Concern                                | In repo    | Deployment-time             |
| -------------------------------------- | ---------- | --------------------------- |
| Structured API logging                 | ✅ pattern | log-based metrics/alerts    |
| Client `ErrorHandler` + sink interface | ✅         | Sentry sink + DSN           |
| Perf budgets in CI                     | ✅         | —                           |
| Dashboards & alerts                    | documented | created in Railway / Sentry |
