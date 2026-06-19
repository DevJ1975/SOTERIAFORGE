# Load-test harness (k6) — thundering-herd correctness proof

A runnable [k6](https://k6.io) harness that drives the Soteria FORGE **Firebase
emulator suite** through the shift-change "thundering herd": many learners
authenticating and flushing their offline progress queues at once. It exists to
**prove correctness/idempotency** — _zero-dup_, _zero-loss_, and exact
_reconciliation_ of the append-only `events` model against the enrollment
projection — and it **retargets to production with one config change**.

> ## Honesty — what this does and does NOT prove
>
> This harness runs against the **local emulator**. It proves:
>
> - **Idempotency / zero-dup** — duplicate event re-sends (same `idempotencyKey`,
>   which IS the document id) collapse onto one document.
> - **Zero-loss** — every distinct event is durably appended.
> - **Reconciliation** — the enrollment projection (`progressVersion`,
>   `completedLessonIds`, `completed`, `attemptCount`, `lastEventKey`) EXACTLY
>   equals the de-duplicated, max-`clientSeq` fold of the learner's events,
>   regardless of arrival order.
> - **Security-rule reachability** — every write/read carries a real GCIP ID
>   token and is evaluated by `firestore.rules` (the same path the browser SDK
>   takes).
>
> It does **NOT** prove the production SLOs. The emulator is a single-process,
> in-memory engine — it does not exercise:
>
> - real **6,000-concurrent** production load,
> - Firestore / Cloud Functions **autoscale**,
> - `minInstances` **warm pools** (cold-start mitigation),
> - **CDN** cache-hit ratios or edge latency,
> - **App Check** enforcement (`enforceAppCheck`),
> - **chaos** on live infrastructure,
> - Cloud Monitoring **alerts / dashboards**.
>
> Those need a deployed production project and are delivered as labelled
> **spec / runbook**, not run here. See `docs/ops/go-no-go-report-template.md`
> ("Not exercised here") and `docs/ops/thundering-herd-runbook.md`.

## The append-only model under test

```
/tenants/{tenantId}/courses/{courseId}/enrollments/{uid}/events/{idempotencyKey}
```

The event document id **is** the client-generated `idempotencyKey`
(`/^[A-Za-z0-9_-]{8,200}$/`). A replay re-writes the **same** id and therefore
collapses. The enrollment doc is a server-derived projection advanced under a
monotonic `progressVersion` / `clientSeq` guard. The offline queue stores
**events** (not enrollment patches), so a reconnect flush is a pure idempotent
upsert. See `docs/HARDENING_CONTRACTS.md` §core model.

## Layout

| File                        | Role                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `config.js`                 | Base URLs + project/tenant/course from env (**emulator defaults**); one-change retarget.        |
| `lib/auth.js`               | GCIP emulator REST: `signUp` / `signInWithPassword` (:9099) → ID tokens.                        |
| `lib/firestore.js`          | Firestore REST upsert of `events` at the contract path + enrollment reads (Bearer token).       |
| `lib/callable.js`           | Callable-function envelope POST (:5001) to exercise rate-limit / backpressure.                  |
| `lib/idempotency.js`        | Contract-valid key generation + duplicate / out-of-order **injectors**, plus the fold.          |
| `lib/shapes.js`             | Plain-JS mirror of the `@forge/shared` progress constants (k6 can't import the TS lib).         |
| `scenarios/login-storm.js`  | Auth spike (10s) + 2-min ramp.                                                                  |
| `scenarios/content-pull.js` | Read-side herd: enrollment reads under rules.                                                   |
| `scenarios/sync-storm.js`   | **The proof:** each VU emits N events, injects M duplicates + out-of-order arrival.             |
| `scenarios/soak.js`         | Low, steady, long-duration correctness soak (event + idempotent replay).                        |
| `reconcile.ts`              | `tsx` + `firebase-admin`: folds events, asserts the projection, **exits non-zero** on mismatch. |

## 1. Install k6 (standalone Go binary — NOT npm)

k6 is a single Go binary; it is **not** an npm package and is intentionally not a
project dependency. Install it from the official distribution:

```bash
# macOS
brew install k6
# Debian / Ubuntu
sudo gpg -k && \
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
    --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 && \
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
    | sudo tee /etc/apt/sources.list.d/k6.list && \
  sudo apt-get update && sudo apt-get install k6
# Windows
winget install k6 --source winget
# or download a release binary: https://github.com/grafana/k6/releases
```

Verify: `k6 version`.

## 2. Start the emulators

The harness talks to **Auth (:9099)** and **Firestore (:8080)**. For the pure
idempotency / reconciliation proof, those two suffice:

```bash
firebase emulators:start --only auth,firestore
```

> **Callables note:** `scenarios/sync-storm.js` can _optionally_ exercise the
> rate-limit/backpressure path via `lib/callable.js` against **Functions
> (:5001)**. That requires the Functions emulator, which needs a built
> `dist/apps/functions` (`npm run functions:build` first) — and the full suite:
> `npm run emulators` (i.e. `firebase emulators:start`). For the correctness
> proof you do **not** need it; the default scenarios use Firestore writes only.

## 3. Seed (optional but recommended)

The reconcile step works against whatever the scenarios write, but seeding gives
you the real tenant + course ids the defaults assume (`atl-airport` /
`atl-ramp-apron-safety`):

```bash
npm run seed
```

## 4. Run the scenarios

The orchestrator wires `loadtest:*` npm scripts (see "package.json scripts"
below). Until then, invoke k6 directly from the repo root:

```bash
# Auth spike + ramp
k6 run tools/load-test/scenarios/login-storm.js

# Read-side herd
k6 run tools/load-test/scenarios/content-pull.js

# THE PROOF: emit events + inject duplicates + out-of-order
k6 run tools/load-test/scenarios/sync-storm.js

# Long, steady correctness soak
k6 run tools/load-test/scenarios/soak.js
```

Tune any run with `-e KEY=value`, e.g.:

```bash
k6 run -e EVENTS_PER_VU=12 -e DUPLICATES_PER_VU=8 -e SHUFFLE_EVENTS=1 \
  tools/load-test/scenarios/sync-storm.js
```

### How sync-storm makes it a proof

Each VU is one learner+device. It:

1. builds **N** distinct events with **stable** `idempotencyKey`s derived
   deterministically from `(deviceId, clientSeq)` — exactly what the offline
   queue does, so a replay re-writes the **same** doc id;
2. injects **M verbatim duplicates** (identical key) — these must collapse;
3. **shuffles** the send order so `clientSeq` arrives **out of order** — the
   monotonic guard must make arrival order irrelevant;
4. upserts every event at the contract path under a real ID token.

k6 only asserts the writes returned `200`. **Correctness of the fold is proven by
`reconcile.ts`**, not in k6.

## 5. Reconcile (the zero-dup / zero-loss assertion)

After a run, fold the ground-truth events and assert the projection:

```bash
npm run loadtest:reconcile          # once the orchestrator adds the script
# or directly:
tsx --tsconfig tools/load-test/tsconfig.json tools/load-test/reconcile.ts
```

`reconcile.ts` reads every learner's `events` subcollection (a `collectionGroup`
query), de-duplicates by `idempotencyKey`, applies in `clientSeq` order under the
monotonic guard, and asserts the persisted enrollment **exactly** equals that
fold. It prints a per-enrollment summary table and **exits non-zero** on any
mismatch (a dropped event, an un-collapsed duplicate, or a stale event that beat
the guard). Wire it into CI as the pass/fail gate after the sync-storm.

## package.json scripts (orchestrator wires these)

This lane does not edit `package.json`. Requested `loadtest:*` script names:

| Script                  | Command                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `loadtest:login-storm`  | `k6 run tools/load-test/scenarios/login-storm.js`                           |
| `loadtest:content-pull` | `k6 run tools/load-test/scenarios/content-pull.js`                          |
| `loadtest:sync-storm`   | `k6 run tools/load-test/scenarios/sync-storm.js`                            |
| `loadtest:soak`         | `k6 run tools/load-test/scenarios/soak.js`                                  |
| `loadtest:reconcile`    | `tsx --tsconfig tools/load-test/tsconfig.json tools/load-test/reconcile.ts` |

## Retargeting to production

Everything is env-driven (see `config.js`). To point at a real project:

```bash
export USE_EMULATOR=0
export PROJECT_ID=<prod-project-id>
export WEB_API_KEY=<real-firebase-web-api-key>
export AUTH_BASE_URL=https://identitytoolkit.googleapis.com/v1
export FIRESTORE_BASE_URL=https://firestore.googleapis.com/v1
export FUNCTIONS_BASE_URL=https://<region>-<project>.cloudfunctions.net  # path adjusted per deploy
```

Retargeting changes **where** the harness writes; it does not, by itself, turn an
emulator correctness run into a production SLO test. A real 6K test needs the prod
project, real accounts/quota, and the warm-pool / autoscale / CDN configuration in
`docs/ops/thundering-herd-runbook.md`.
