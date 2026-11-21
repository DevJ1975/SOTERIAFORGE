# Unity (WebGL) ↔ Soteria Assurance — cmi5 integration contract

Unity games integrate as **cmi5 Assignable Units (AUs)** with no bespoke
per-game backend work. The contract is: **launch parameters in, xAPI out.**

## 1. Registration

1. Build the Unity project for **WebGL**.
2. Upload the build to Cloud Storage under
   `tenants/{tenantId}/games/{gameId}/{version}/` (see `storage.rules`).
3. Register it as a module with `contentType: "unity"` and an `assetRef`
   pointing at the build's `index.html`. Multiple versions are supported; the
   module records the active version (rollback = repoint the version).

## 2. Launch

Assurance launches the AU (rendered in `forge-unity-embed`, a sandboxed, responsive,
`@defer`-loaded iframe) with the cmi5 launch query parameters:

| Param          | Meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| `endpoint`     | LRS endpoint the AU posts xAPI statements to                  |
| `fetch`        | One-time-use URL the AU calls to obtain its auth token        |
| `actor`        | xAPI Agent JSON (account.homePage + name = uid; pseudonymous) |
| `registration` | UUID grouping all statements for this attempt                 |
| `activityId`   | The AU's activity IRI                                         |

`@assurance/standards` `buildLaunchUrl()` / `parseLaunchParams()` implement this.
The `fetch` flow returns a short-lived auth token scoped to the caller's tenant
(the caller's auth claim is authoritative — a game cannot post to another tenant).

## 3. Reporting (xAPI out)

The Unity build uses a Unity xAPI/cmi5 library to emit statements to `endpoint`
with the fetched token:

- `initialized` — AU started
- `progressed` — periodic progress (`result.extensions` may carry %), optional
- `completed` — AU finished
- `passed` / `failed` — with `result.score.scaled` (-1..1) and `success`
- custom verbs — in-game events (namespaced under
  `https://soteriaforge.com/xapi/verbs/...`)

Every statement is tenant-tagged server-side via
`context.extensions["https://soteriaforge.com/xapi/extensions/tenant"]`.

Assurance reflects `completed` + score into the learner's **enrollment** and triggers
**gamification** (XP/badges) through server-side validation — the game's reported
score is verified, never blindly trusted.

## 4. Lightweight signals (optional, non-authoritative)

For UI niceties (e.g. "request fullscreen"), the iframe may `postMessage` to the
host; `forge-unity-embed` forwards these via its `signal` output. **This path is
never used for completion/score** — only cmi5/xAPI is authoritative.

## 5. Launch flow (built on the Forge API)

Implemented in `backend/apps/standards/cmi5.py` and `cmi5_views.py`; the learner app
uses `assurance-managed-cmi5-player` (`libs/standards`). A hand-testable AU is in
[examples/cmi5-stub-au.html](./examples/cmi5-stub-au.html).

1. **Launch** — `POST /api/standards/lessons/{lessonId}/cmi5/launch` (signed-in
   learner). The lesson must be `cmi5` or `unity`, in a published course the caller
   is enrolled in, with an absolute `externalUrl` (or `assetRef`) on an origin that
   is neither the API nor a Forge app. Returns
   `{ id, auUrl, endpoint, fetch, actor, registration, activityId, expiresAt }`.
   `registration` is the enrollment id; `id` is the cmi5 session. A new launch
   revokes the previous session for that learner and lesson. Sessions last 4 hours
   (`CMI5_SESSION_TTL`).
2. **Fetch** — the AU sends one `POST` to the `fetch` URL and receives
   `{ "auth-token": "..." }`. A second use returns `{ "error-code": "1" }`, an
   unknown URL `"2"`, an expired or revoked launch `"3"` (HTTP 403).
3. **xAPI** — the AU sends `Authorization: Basic <auth-token>` (the cmi5
   specification) or `Bearer <auth-token>`, plus `X-Experience-API-Version: 1.0.3`:
   - `POST {endpoint}statements` (one statement or up to 50), or
     `PUT {endpoint}statements?statementId=<uuid>`.
   - `GET {endpoint}activities/state?stateId=LMS.LaunchData` for the launch data.
     AU-written state (saves) is not supported yet.
4. **Session status** — `GET /api/standards/cmi5/sessions/{id}` (signed-in learner)
   returns what the AU has reported, including the completion (progress, XP, badges).
   The learner app polls it; statements never pass through the app.

Rules the server enforces:

- `actor`, `context.registration`, the cmi5 session id and the tenant extension
  (`https://soteriaforge.com/xapi/extensions/tenant`) are always set from the
  session. Client-supplied values are overwritten.
- Order: `initialized` first and once; `completed` once; one of `passed` / `failed`
  per session; nothing after `terminated`. Violations return 409.
- `completed`, `passed`, `failed` and `terminated` must be about `activityId`.
  Other verbs are stored as in-game events and do not affect progress.
- The lesson completes on `completed` **or** `passed` (cmi5 moveOn
  `CompletedOrPassed`, the same rule as SCORM 2004 here). `failed` alone does not
  complete it. `result.score.scaled` becomes a 0–100 score.
- Re-sending a statement id with identical content is a no-op; with different
  content it is a 409. A batch is stored completely or not at all.
- Limits: 64 KB per statement, 5,000 statements per session.
- `cmi5` and `unity` lessons cannot be completed with "Mark as complete".

### Simulator lessons: the server scores the run

For a lesson with no scenario, the score is the AU's claim. Attach a `forge-sim`
scenario ([rust/README.md](../rust/README.md)) and the server scores the run itself:

- **Attach** — `PUT /api/standards/lessons/{lessonId}/scenario` (course staff) with
  the scenario JSON; `GET` reads it, `DELETE` removes it. It is validated against the
  installed rules. The drill's scenario is
  `games/forge-unity/Assets/Drill/lockout-drill.scenario.json`.
- **Launch** — the session keeps a copy of the scenario and a random seed.
  `LMS.LaunchData` has `moveOn: "Passed"` and a `launchParameters` string holding
  JSON: `{ scenario, seed, rulesVersion, actionLogExtension }`. `seed` is a decimal
  string. A launch is refused with 503 if the rules are not installed on the server.
- **Verdict** — `passed` / `failed` must carry the action log,
  `result.extensions["https://soteriaforge.com/xapi/extensions/action-log"]`, a list
  of `{ "t": <ms since the run started>, "step": "<step id>" }` in the order they
  happened, wrong steps included. Without it, or with a log the rules cannot replay,
  the statement is a 400 and the session is still unjudged.
- The server replays the log and records **its** verdict and score. The stored
  statement is rewritten to match (verb, `result.success`, `result.score.scaled`) and
  gains `result.extensions[".../extensions/replay"]` with the replay's result and what
  the AU claimed. A claim that differs is written to the audit log
  (`standards.cmi5.score_mismatch`).
- The lesson completes only on a replayed pass. `completed` is stored but completes
  nothing, and its score is ignored.

The scenario, including the order of its steps, is sent to the AU: replay stops a
forged score, not a learner reading the rules out of the build.

The launch call must run in the browser only, never during server-side pre-render.

## 6. Versioning

The active AU version is determined by the module's `externalUrl` (preferred)
or `assetRef` field — this becomes the `auUrl` passed to the server. To roll
back to a previous build, repoint `externalUrl`/`assetRef` to the previous
version's URL; no backend migration is required.

## 7. Developer checklist

- [ ] WebGL build loads inside a sandboxed iframe (`allow-scripts allow-same-origin`).
- [ ] Reads cmi5 launch params from the query string.
- [ ] Performs the `fetch` token exchange (one `POST`) before sending statements.
- [ ] Sends `X-Experience-API-Version: 1.0.3` on every xAPI request.
- [ ] Emits `initialized` → … → `completed` (+ `passed`/`failed` with score).
- [ ] Simulator lessons: sends the action log with `passed` / `failed`.
- [ ] Handles pause/resume and reports a final statement on unload.
- [ ] Verified end-to-end against the Assurance LRS in staging.
