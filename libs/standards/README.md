# @forge/standards — SCORM / xAPI / cmi5 Standards Engine

This library is the client-side standards engine for SOTERIAFORGE. It owns all
SCORM, xAPI, and cmi5 concerns and provides the glue between e-learning content
and the platform's enrolment, completion, and gamification systems.

---

## Modules

### `XapiClient` (`xapi-client.ts`)

An Angular injectable service (provided in root) that:

- **`buildStatement(opts)`** — Constructs a spec-compliant xAPI statement
  object. The learner is represented as an Agent with a pseudonymous
  `account.name` (Firebase UID) and `account.homePage` (platform URL). Every
  statement is tenant-tagged via
  `context.extensions[XAPI_TENANT_EXTENSION]` so that the LRS can enforce
  tenant isolation.

- **`send(statement)`** — Forwards a statement to the `ingestStatement` Firebase
  callable function via `@angular/fire/functions`. Gracefully no-ops (with a
  console warning) if `Functions` is not available in the current DI context,
  e.g. during unit tests.

### `VERB_MAP` / `getVerb` (`verbs.ts`)

Re-exports and maps the eight platform xAPI verbs defined in `@forge/shared`
(`XAPI_VERBS`) to friendly descriptor objects that carry both the canonical IRI
and an `en-US` display label.

Friendly names: `launched`, `initialized`, `progressed`, `completed`, `passed`,
`failed`, `answered`, `terminated`.

### `ScormRuntimeService` (`scorm-runtime.service.ts`)

An Angular injectable service that hosts a SCORM runtime inside the LMS shell:

- Dynamically imports `scorm-again` at runtime (`await import('scorm-again')`)
  to avoid bundling the SCORM polyfill unless a SCORM module is actually loaded.
- Instantiates `Scorm12API` or `Scorm2004API` and mounts it on `window.API` /
  `window.API_1484_11` so that SCORM content loaded inside an `<iframe>` can
  communicate with the LMS.
- Wires the SCORM commit and finish/terminate events to a caller-supplied
  `persist(cmi)` callback, allowing the host application to persist CMI state to
  Firestore.
- Exposes Angular **signals**: `completed` (boolean) and `score` (number|null)
  that update automatically when the SCORM content reports progress.

API:

```ts
await scormRuntime.initialize({
  version: '2004',          // '1.2' | '2004'
  initialCmi: { ... },     // optional seed data
  persist: async (cmi) => { /* save to Firestore */ },
});

scormRuntime.terminate();   // clean up window globals
```

### `ScormPlayerComponent` (`scorm-player.component.ts`)

A standalone, OnPush Angular component (selector `forge-scorm-player`) that embeds a
SCORM SCO in a sandboxed, responsive `<iframe>`.

On mount (browser only, via `afterNextRender`/`isPlatformBrowser`), the component
calls `ScormRuntimeService.initialize()` to mount the SCORM API on `window` **before**
setting the iframe `src`, ensuring the SCO can find the API on load.

Signal inputs:

- `launchUrl` (required) — absolute URL to the SCO's entry point.
- `scormVersion` — `'1.2' | '2004'` (default `'2004'`).
- `initialCmi?` — seed CMI data to resume a previous session.

Outputs:

- `commit` — emits `Record<string, unknown>` on every SCORM commit.
- `completed` — emits `{completed: boolean; score?: number}` when the SCO finishes.

Calls `ScormRuntimeService.terminate()` in `ngOnDestroy`.

### `Cmi5LauncherComponent` (`cmi5-launcher.component.ts`)

A standalone, OnPush Angular component (selector `forge-cmi5-launcher`) that launches a
cmi5 Assignable Unit (AU) in a sandboxed, responsive `<iframe>`.

Builds the full launch URL via `buildLaunchUrl` from `cmi5.ts` and renders it reactively.
The AU communicates with the LRS directly; this component does not intercept xAPI traffic.

Signal inputs:

- `auUrl` (required) — base URL of the AU.
- `endpoint` — xAPI LRS endpoint.
- `fetch` — token fetch URL.
- `actor` — JSON-serialised xAPI Actor.
- `registration` — registration UUID.
- `activityId` — Activity IRI.

Outputs:

- `completed` — emits `{completed: boolean}` as a lightweight side-channel (authoritative
  tracking runs via the LRS pipeline).

SSR-safe: the iframe is only rendered on the browser via `isPlatformBrowser`.

### `buildLaunchUrl` / `parseLaunchParams` (`cmi5.ts`)

Pure functions for the cmi5 launch URL protocol:

- **`buildLaunchUrl(base, params)`** — Appends the five standard cmi5 query
  parameters (`endpoint`, `fetch`, `actor`, `registration`, `activityId`) to a
  base AU URL.
- **`parseLaunchParams(url)`** — Extracts those parameters back out of a launch
  URL. Accepts a string or a `URL` object. Missing params are returned as
  empty strings.

---

## Completion and Score Flow

```
SCORM / xAPI content
      │  commit / finish events
      ▼
ScormRuntimeService         cmi5 AU
  signals: completed,   ←── sends xAPI statements directly to LRS
           score              via XapiClient.send()
      │
      │  persist(cmi) callback
      ▼
Firestore (enrolment doc)
      │
      │  Cloud Function trigger
      ▼
lms-core: EnrolmentService  →  completion event
      │
      ▼
gamification: GamificationService  →  XP, badges, leaderboard
```

When a SCORM commit fires, `ScormRuntimeService` calls the host's `persist`
callback with the raw CMI object. The host (typically `lms-core`) writes this
to the learner's enrolment document in Firestore. A Cloud Function watches for
the `lesson_status` / `success_status` transition and:

1. Marks the enrolment as complete.
2. Publishes a completion event consumed by the gamification engine, which
   awards XP, evaluates badge criteria, and updates the leaderboard.

For xAPI-native (cmi5) content, the AU sends statements directly to the LRS via
`XapiClient.send()`. The `ingestStatement` Cloud Function receives the
statement, validates tenant scope, writes it to the LRS collection, and
similarly triggers the gamification pipeline when a `completed` or `passed`
statement arrives.
