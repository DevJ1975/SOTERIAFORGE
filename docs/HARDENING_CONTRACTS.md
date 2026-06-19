# Thundering-Herd Hardening — Build Contracts (authoritative)

Hardening Soteria Forge for the 6,000-concurrent shift-change burst on the **real Firebase stack**
(see `/root`-approved plan). Scope: core code-actionable hardening + a runnable k6 correctness
harness. SCORM/xAPI are out of scope. Infra that can't run here (real 6K load, DB/CDN autoscale,
warm pools, chaos, prod project) is delivered as spec/runbook, clearly labelled not-run.

## Core model

Append-only **`events`** subcollection keyed by a client-generated **idempotency key**; the
enrollment doc is a server-derived projection updated under a **monotonic `progressVersion` guard**.

```
/tenants/{tenantId}/courses/{courseId}/enrollments/{uid}/events/{idempotencyKey}
```

A replay re-writes the **same doc id** ⇒ collapses (the property the sync-storm must prove). Offline
queue stores **events** (not enrollment patches) ⇒ reconnect flush is a pure idempotent upsert.

## Frozen cross-lane contracts (do not diverge)

1. **`idempotencyKey`** — `z.string().regex(/^[A-Za-z0-9_-]{8,200}$/)` (primitive in
   `libs/shared/src/lib/schemas/primitives.ts`). It IS the event document id (rules enforce
   `data.idempotencyKey == eventId`).
2. **`progressEvent`** (`libs/shared/src/lib/schemas/progress.ts`):
   ```ts
   { idempotencyKey, uid, tenantId, courseId,
     kind: z.enum(['lesson_completed','course_completed','score_recorded']),
     lessonId?: docId, score?: number(0..100),
     clientSeq: count,            // monotonic per-device → ordering + guard
     occurredAt: isoDateTime,     // client clock (advisory)
     deviceId: z.string().min(1),
     createdAt: isoDateTime }     // server-authoritative on aggregate
   ```
3. **`enrollment`** additive+defaulted fields (`libs/shared/src/lib/schemas/course.ts`):
   `progressVersion: count.default(0)`, `completedLessonIds: z.array(docId).default([])`,
   `attemptCount: count.default(0)`, `lastEventKey: idempotencyKey.optional()`. (Defaults keep
   existing docs + rules-test fixtures valid.)
4. **Events collection path** — exactly as above. Lane B owns `enrollmentEventsCol` /
   `enrollmentEventDoc(db, tenantId, courseId, uid, idempotencyKey)` in
   `libs/data-access/src/lib/collections.ts` (via `zodConverter(progressEvent)`).
5. **`@forge/shared` stagger utils** (`libs/shared/src/lib/stagger.ts`):
   - `deviceId(): string` — stable, persisted (localStorage/Preferences); reused for
     `progressEvent.deviceId`.
   - `staggerDelayMs(deviceId: string, windowMs: number): number` — deterministic hash→spread.
   - `backoff(attempt: number, opts?): number` — exponential + full jitter; retry only on
     429/408/`too-many-requests`/`unavailable`/`deadline-exceeded`.
   - `withRetry<T>(fn: () => Promise<T>, opts?): Promise<T>`.
6. **`@forge/shared` telemetry** (`libs/shared/src/lib/telemetry.ts`): `emit(name: string, fields?:
Record<string, unknown>): void` (no-op default sink).
7. **`ProgressSyncQueue`** (learner, Lane C) API: `enqueue(event)`, `flush(): Promise<{synced:number;
failed:number}>`, `pending(): Promise<number>`, `clear(): Promise<void>`. Persists a monotonic
   per-device `clientSeq`. Backed by `@capacitor/preferences` (works web + native).
8. **`progress.service.ts`** (Lane B) gains optional `idempotencyKey`/`deviceId`/`clientSeq` params
   on `setLessonProgress`/`completeCourse` (default-generated when omitted, so existing callers and
   specs keep compiling). It writes the event (idempotent `setDoc`) then applies the enrollment in a
   `runTransaction` rejecting `clientSeq <= progressVersion`.

## Ownership lanes (no cross-lane edits; no git; no package.json/.github — orchestrator owns those)

| Lane                                  | Owns                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Schema/contracts**              | `libs/shared`: `schemas/primitives.ts` (idempotencyKey), `schemas/progress.ts` (new), `schemas/course.ts` (enrollment fields), `stagger.ts` (new), `telemetry.ts` (new), `src/index.ts` + specs                           |
| **B — Write layer**                   | `libs/data-access/src/lib/collections.ts`; `libs/lms-core/src/lib/services/{progress,enrollment}.service.ts` (+ specs); `firestore.rules`; `libs/data-access/src/rules/firestore.rules.spec.ts`; `firestore.indexes.json` |
| **C — Offline queue + stagger hooks** | `apps/learner/src/app/offline/progress-sync-queue.service.ts` (+ spec); `apps/learner/.../features/player/player.ts`; `libs/auth/src/lib/principal.store.ts`                                                              |
| **D — Functions**                     | `apps/functions/src/main.ts`; `apps/functions/src/lib/{ports,adapters,errors}.ts`; new `rate-limit.core.ts`, `aggregate-progress.core.ts`, `logger.ts`, `retry.ts` (+ specs)                                              |
| **E — PWA/edge**                      | `apps/learner/ngsw-config.json` (new); `apps/learner/project.json`; `apps/learner/src/app/app.config.ts`; `firebase.json` (headers)                                                                                       |
| **F — Load-test + docs**              | `tools/load-test/**`; `docs/ops/**` (orchestrator adds the `loadtest:*` package.json scripts after F lands)                                                                                                               |

**Sequencing:** A → (B, E parallel) → C, D, F. C edits `principal.store.ts`; E edits `app.config.ts`
— disjoint files. Wave-2 lanes import the real landed exports from Lane A.

## Honest not-run labels (Lane F docs must carry these)

Real 6K prod load, DB/CDN autoscale, `minInstances` warm pools, `enforceAppCheck`, chaos on live
infra, and Cloud Monitoring alerts/dashboards need a deployed production project — **not exercised
here**. The emulator + k6 harness prove **correctness/idempotency** (zero-dup / zero-loss /
reconciliation) and retarget to prod via env/base-URL.

## Conventions

Zod shapes in `@forge/shared`; all Firestore I/O via data-access converters/helpers; deny-by-default
rules + tests ship with new paths; design tokens only; Prettier (single quotes/width 100/trailing
commas); nx module boundaries (`type:app`→feature/data-access/ui/util; `type:feature`→same;
`type:data-access`→data-access/util; `type:util`→util). Self-check each owned project
(`NX_DAEMON=false npx nx lint/test/build <proj>`; `npm run test:rules` for B).
