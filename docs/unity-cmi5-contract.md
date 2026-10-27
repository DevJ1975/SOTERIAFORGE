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
`context.extensions["https://soteriaforge.com/xapi/extensions/tenantId"]`.

Assurance reflects `completed` + score into the learner's **enrollment** and triggers
**gamification** (XP/badges) through server-side validation — the game's reported
score is verified, never blindly trusted.

## 4. Lightweight signals (optional, non-authoritative)

For UI niceties (e.g. "request fullscreen"), the iframe may `postMessage` to the
host; `forge-unity-embed` forwards these via its `signal` output. **This path is
never used for completion/score** — only cmi5/xAPI is authoritative.

## 5. Launch flow (target, to be built on the Forge API)

The earlier launch used a Firebase callable and a Firestore-backed module player;
both were removed with Firebase. `forge-cmi5-launcher` (which builds the launch URL
and renders the sandboxed iframe) remains. The Django `standards` app already
serves managed SCORM; the cmi5/Unity launch endpoints below are still to be added:

1. **Launch** — the learner app asks the API for launch parameters for the lesson
   (`activityId`, `auUrl`). The API validates the caller's membership and tenant,
   mints a short-lived fetch token, and returns `{ auUrl, endpoint, fetch, actor,
registration, activityId }`.
2. **Fetch (fetch URL -> auth token)** — the AU calls the `fetch` URL once to
   exchange it for a short-lived auth token. The token is scoped to the caller's
   tenant; the server's authenticated tenant is authoritative and an AU cannot
   post statements to another tenant's LRS endpoint.
3. **xAPI (Bearer auth-token -> tenant-stamped statements)** — the AU posts xAPI
   statements to `endpoint` using `Authorization: Bearer <token>`. The LRS pipeline
   stamps each statement with the tenant ID from the auth token, regardless of any
   client-supplied value.

The `actor` field in the launch result is the server-canonical xAPI Agent for the
learner, JSON-serialised into `forge-cmi5-launcher`'s `actor` input. The launch call
must run in the browser only (`afterNextRender`), never during server-side pre-render.

## 6. Versioning

The active AU version is determined by the module's `externalUrl` (preferred)
or `assetRef` field — this becomes the `auUrl` passed to the server. To roll
back to a previous build, repoint `externalUrl`/`assetRef` to the previous
version's URL; no backend migration is required.

## 7. Developer checklist

- [ ] WebGL build loads inside a sandboxed iframe (`allow-scripts allow-same-origin`).
- [ ] Reads cmi5 launch params from the query string.
- [ ] Performs the `fetch` token exchange before sending statements.
- [ ] Emits `initialized` → … → `completed` (+ `passed`/`failed` with score).
- [ ] Handles pause/resume and reports a final statement on unload.
- [ ] Verified end-to-end against the Assurance LRS in staging.
