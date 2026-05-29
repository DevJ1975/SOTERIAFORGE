# Unity (WebGL) ↔ Soteria FORGE — cmi5 integration contract

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

FORGE launches the AU (rendered in `forge-unity-embed`, a sandboxed, responsive,
`@defer`-loaded iframe) with the cmi5 launch query parameters:

| Param          | Meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| `endpoint`     | LRS endpoint the AU posts xAPI statements to                  |
| `fetch`        | One-time-use URL the AU calls to obtain its auth token        |
| `actor`        | xAPI Agent JSON (account.homePage + name = uid; pseudonymous) |
| `registration` | UUID grouping all statements for this attempt                 |
| `activityId`   | The AU's activity IRI                                         |

`@forge/standards` `buildLaunchUrl()` / `parseLaunchParams()` implement this.
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

FORGE reflects `completed` + score into the learner's **enrollment** and triggers
**gamification** (XP/badges) through server-side validation — the game's reported
score is verified, never blindly trusted.

## 4. Lightweight signals (optional, non-authoritative)

For UI niceties (e.g. "request fullscreen"), the iframe may `postMessage` to the
host; `forge-unity-embed` forwards these via its `signal` output. **This path is
never used for completion/score** — only cmi5/xAPI is authoritative.

## 5. Developer checklist

- [ ] WebGL build loads inside a sandboxed iframe (`allow-scripts allow-same-origin`).
- [ ] Reads cmi5 launch params from the query string.
- [ ] Performs the `fetch` token exchange before sending statements.
- [ ] Emits `initialized` → … → `completed` (+ `passed`/`failed` with score).
- [ ] Handles pause/resume and reports a final statement on unload.
- [ ] Verified end-to-end against the FORGE LRS in staging.
