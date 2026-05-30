# Observability

## Backend (Cloud Functions)

- **Structured logging** via `firebase-functions/logger` (`logger.info/.warn/
.error` with structured fields) → Cloud Logging. Each privileged function logs
  actor, tenant, and outcome; sensitive values are never logged.
- **Error reporting**: uncaught errors surface in Cloud Error Reporting
  automatically; `HttpsError` returns typed codes to clients.
- **Audit trail**: privileged actions also append to the immutable audit log
  (see `docs/compliance.md`) — distinct from operational logs.

## Frontend (Angular apps)

- `@forge/ui` provides `provideObservability(sink?)`: a custom Angular
  `ErrorHandler` that forwards uncaught errors + telemetry events to a pluggable
  `TelemetrySink` (default: console). Apps swap in a **Sentry** or **GCP Error
  Reporting** sink at deployment by providing a `TelemetrySink` implementation —
  the app code never changes.
- **Firebase Performance Monitoring** + **Google Analytics** are added at the
  app shell (deployment-time, gated on a real `measurementId`).
- **Web Vitals**: SSR + incremental hydration (storefront) and route-level
  `@defer` for heavy widgets (players/games) keep LCP/TBT low; build budgets fail
  CI on regressions.

## Dashboards & alerting (deployment-time)

- Cloud Monitoring dashboards: function latency/error rate, Firestore
  read/write/contention, App Check rejections, Stripe webhook failures.
- Alerts: webhook signature failures, rules-denied spikes, function error-rate
  thresholds, budget overruns.

## What ships vs. what's wired at deploy

| Concern                                | In repo       | Deployment-time             |
| -------------------------------------- | ------------- | --------------------------- |
| Structured function logging            | ✅ pattern    | log-based metrics/alerts    |
| Client `ErrorHandler` + sink interface | ✅            | Sentry/GCP sink + DSN       |
| Perf budgets in CI                     | ✅            | —                           |
| Firebase Performance/Analytics         | provider stub | real `measurementId`        |
| Dashboards & alerts                    | documented    | created in Cloud Monitoring |
