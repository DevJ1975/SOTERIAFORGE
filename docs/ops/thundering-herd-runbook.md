# Thundering-herd runbook — shift-change burst

> **Scope & honesty.** This runbook covers operating Soteria FORGE through the
> ~6,000-concurrent shift-change burst (every device in a facility wakes, authenticates,
> and flushes its offline progress queue within a few minutes). The **code-level**
> hardening (append-only idempotent events, monotonic projection guard, client
> stagger + backoff, offline event queue) is implemented and proven against the
> emulator (see `tools/load-test/`). The **infrastructure** knobs below
> (`minInstances` warm pools, autoscale, CDN, App Check enforcement) require a
> **deployed production Firebase project** and are **not exercised in this
> environment** — they are documented here as the operator playbook. Treat every
> concrete number as a **starting point to be validated by a real load test**, not
> a guarantee. Cross-reference the not-run inventory in
> `go-no-go-report-template.md`.

## 1. The burst, and why it is survivable in design

At a shift change, thousands of installed apps reconnect at once. The platform is
designed so that this is a **write-collapsing, replay-safe** event, not a stampede:

- **Append-only events keyed by an idempotency key.** Every progress write lands
  at `tenants/{t}/courses/{c}/enrollments/{u}/events/{idempotencyKey}`; the key
  **is** the document id. A duplicate flush (offline retry, double-tap, network
  jitter) re-writes the same id and **collapses** — zero-dup.
- **Server-derived projection under a monotonic guard.** The enrollment doc is a
  projection of the events, advanced only when `clientSeq > progressVersion`.
  Out-of-order arrival is therefore harmless — zero-loss, order-independent.
- **Offline queue stores events, not enrollment patches.** Reconnect flush is a
  pure idempotent upsert; nothing to merge, nothing to lose.
- **Client-side stagger + jittered backoff.** `@forge/shared`
  `staggerDelayMs(deviceId, windowMs)` spreads the initial reconnect
  deterministically across a window; `backoff()` + `withRetry()` retry only on
  `429` / `408` / `too-many-requests` / `unavailable` / `deadline-exceeded` with
  exponential + full jitter. This flattens the spike **before** it reaches the
  backend.

## 2. Pre-burst checklist (operator)

Run T-30 minutes before a known shift change (or keep standing for facilities with
continuous shifts):

- [ ] **Warm pools set** on the progress-write and callable functions (see §3).
- [ ] **Autoscale ceilings** reviewed against the expected device count (§4).
- [ ] **Stagger window** (`windowMs`) sized to the device population — wider for
      larger facilities (§5).
- [ ] **App Check** enforcement state confirmed (enforced in prod; see §6).
- [ ] **Dashboards + alert policies** live (see `observability-spec.md`).
- [ ] **Rollback plan** confirmed reachable (§8) and the previous known-good
      release tag noted.
- [ ] **Reconciliation** green on the latest emulator run (`npm run loadtest:reconcile`).

## 3. Warm pools (cold-start mitigation) — WS4

Cold starts are the dominant tail-latency risk in a burst. Keep a warm floor on
the hot functions so the first thousand requests do not pay init cost.

| Knob             | Where                                           | Starting point (validate by load test)               |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------- |
| `minInstances`   | `onCall` / write-path function options (Lane D) | `5`–`20` on hot functions                            |
| `maxInstances`   | same                                            | bounded so a stampede can't fan out unboundedly (§4) |
| `concurrency`    | per-instance concurrent requests (gen-2)        | tune up to flatten instance count                    |
| `memory` / `cpu` | function resource class                         | size for the projection transaction                  |

> **Not run here.** `minInstances` warm pools incur standing cost and only exist
> on a deployed project; the emulator always cold-paths in-process. Set and verify
> these in the Firebase console / function deploy options, then confirm with a real
> load test.

## 4. Autoscale & backpressure ceilings — WS4

The point of a ceiling is **graceful shedding**, not infinite scale:

- **`maxInstances`** caps fan-out. When saturated, the runtime returns
  `429 / resource-exhausted` — which the client treats as **retryable** and backs
  off (§1). This converts an overload into a slightly slower, still-correct flush.
- **Firestore** scales writes automatically but rewards **key spread**. Our event
  ids are spread across `{uid}` and a hashed key component, avoiding hot-spot
  monotonic-prefix contention.
- **Rate-limit core (Lane D).** The callable rate-limit surfaces
  `resource-exhausted`; `tools/load-test/lib/callable.js` exercises this path so
  the client's retry contract is verified end-to-end.

> **Not run here.** Real autoscale, Firestore write-throughput limits, and the
> 6K-concurrent shed behaviour require the prod project. The emulator does not
> autoscale or rate-limit realistically.

## 5. Stagger window sizing — WS4

`staggerDelayMs(deviceId, windowMs)` is deterministic per device, so a device
always picks the same slot (idempotent retries don't re-randomize the herd).

- **Wider window** → flatter spike, longer worst-case time-to-sync.
- **Narrower window** → faster sync, taller spike.
- Rule of thumb: size `windowMs` so `devices / windowSeconds` stays under the
  warm-pool + autoscale headroom from §3–§4. Re-derive after every real load test.

## 6. App Check enforcement

In production, `enforceAppCheck` should be **on** for the write path and
callables so only genuine app instances can append events. **Not run here** —
App Check is a no-op until a real site key + project are configured
(`libs/auth/src/lib/app-check.providers.ts`); the emulator does not enforce it.

## 7. Offline queue-flush behaviour — WS5 (and the SW-vs-Capacitor caveat)

The learner persists progress as **events** in a per-device queue
(`ProgressSyncQueue`, backed by `@capacitor/preferences`, web + native) with a
monotonic per-device `clientSeq`. On reconnect:

1. The queue **flushes** each pending event as an idempotent upsert (`flush()` →
   `{ synced, failed }`); failures stay queued for the next attempt.
2. Because the id is the idempotency key, a partial flush that retries **cannot
   duplicate** — re-sent events collapse.
3. Stagger + backoff govern **when** the flush starts and how it retries.

> ### SW-vs-Capacitor caveat — WS5 (critical)
>
> Background sync semantics differ by platform and **change what "flush on
> reconnect" means**:
>
> - **Installed native app (Capacitor / iOS / Android):** the queue lives in
>   `@capacitor/preferences` and flushes when the app process is foregrounded /
>   network returns. There is **no guaranteed OS background flush** while the app
>   is killed — durable progress is preserved, but **sync happens on next open**,
>   not silently in the background.
> - **Web / PWA (Angular service worker, `ngsw`):** the Angular SW handles asset
>   caching and offline shell, but **does not** perform Background Sync of the
>   progress queue in this build. Web flush is **tab-lifetime** bound: the queue
>   flushes while a tab is open and online; a fully closed browser does **not**
>   background-sync. Durable web offline + true background sync require the
>   installed app (mirrors the offline-video constraint in
>   `docs/OFFLINE_VIDEO.md`).
>
> **Operational consequence:** at a shift change, expect the flush spike to track
> **app-open / app-foreground** events, not a single instantaneous wave. Size the
> stagger window for the realistic open-rate, and do not assume killed apps have
> already synced. This is a correctness-preserving caveat (no data is lost), but it
> shapes the burst timing.

## 8. Rollback

The hardening is **additive and backward-compatible** by contract (new enrollment
fields are defaulted; existing docs and rules-test fixtures stay valid;
`progress.service.ts` params are default-generated). Rollback options, least to
most disruptive:

1. **Revert the release** to the previous known-good tag (Hosting + Functions).
   Because writes are idempotent events, in-flight flushes from the new clients
   remain valid against the old projection logic (the fold is the same shape).
2. **Disable App Check enforcement** (if a misconfigured site key is rejecting
   genuine clients) as a targeted mitigation rather than a full rollback.
3. **Lower `maxInstances` / widen the stagger window** to shed load deliberately
   if the backend is saturating — degrades latency, preserves correctness.
4. **Pause new writes** (feature-flag the write path) only as a last resort;
   queued events persist client-side and flush safely once re-enabled (idempotent).

After any rollback, run `npm run loadtest:reconcile` against the affected tenant's
data to confirm no enrollment diverged from its event fold.

> **Not run here.** Production rollback (Hosting channel / `firebase deploy`
> rollback, Functions version pinning) requires the deployed project. The
> reconciliation gate, however, runs against any environment including the
> emulator.
