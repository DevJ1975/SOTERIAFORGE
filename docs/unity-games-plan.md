# Soteria Forge — Plan: Unity Simulators, RPG and Lesson Games

- **Status:** Draft v0.1 · 2026-11-20 · Jamil Jones
- **Builds on:** [unity-cmi5-contract.md](./unity-cmi5-contract.md) (the game ↔ platform
  contract), [scorm-cmi5.md](./scorm-cmi5.md), [native-parity-plan.md](./native-parity-plan.md)
- **Does not change:** the Angular apps, the Django API as the only backend, the existing
  Phaser / Pixi / Rive card games in `apps/games`

## 1. Summary

Lessons can point at three weights of game:

| Type                                              | Engine                        | Runs on                                       |
| ------------------------------------------------- | ----------------------------- | --------------------------------------------- |
| Quick lesson games (flip, match, sort, scenarios) | Phaser / Pixi / Rive (exists) | Web player and the mobile WebView             |
| Workplace simulators                              | Unity (URP)                   | Native iOS and Android; reduced tier on WebGL |
| RPG                                               | Unity (URP), same project     | Native iOS and Android; reduced tier on WebGL |

Every Unity experience is a **cmi5 Assignable Unit**: launch parameters in, xAPI out.
The backend does not know or care which platform the learner is on.

Rust appears in one place: a `forge-sim` crate holding deterministic rules and scoring.
Unity links it as a native plugin; Django imports the same crate as a Python wheel and
replays the learner's action log, so the score that reaches enrollment and gamification
is the server's, not the client's.

## 2. Decisions

1. **One Unity project** for all simulators and the RPG, with a shared core package.
   On mobile, simulator code ships in the app; scenes, art and scenario data download
   on demand (Addressables).
2. **Unity as a Library** inside the existing native shells in `mobile/android` and
   `mobile/ios`. A `unity` lesson opens the Unity view instead of the WebView.
3. **Networking stays in C#** (`UnityWebRequest`). Rust is pure computation, no I/O.
4. **Scenarios are data.** A lesson maps to _game + scenario id_; new scenarios ship
   without an app release, new mechanics do not.
5. **The RPG reads platform XP.** Character level is a view of `apps/gamification`
   XP and levels, not a second progression system.
6. **Saves live on the server**, per learner, through the xAPI State API.

## 3. Phases

Estimates are rough, for one developer comfortable in Unity and Django, and exclude art
production. Each phase ends with something demonstrable.

### Phase 0 — Spikes and decisions (about 1 week)

Answer the questions that could change the plan before building on them.

- Pick the Unity LTS version and the minimum supported iPhone and Android device.
- Spike: empty URP scene exported as a library, launched from the Android shell and
  the iOS shell, and closed again.
- Spike: one Rust function called from Unity on iOS, Android and WebGL.
- Decide where the Unity project lives (this repo under `games/` or its own repo with
  Git LFS).

**Exit:** a go / no-go on Rust in the WebGL tier (fallback: Rust on native only, C#
rules on WebGL with the server replay still authoritative), and an ADR recording the
choices.

### Phase 1 — cmi5 launch and LRS endpoints in Django (about 2 weeks)

> **Built 2026-11-20** (backend, learner app, tests), and exercised from a real
> browser by the Phase 2 drill. Not yet done: a run through the learner app on a
> deployed stack. See [unity-cmi5-contract.md](./unity-cmi5-contract.md) §5.

Section 5 of the contract is still unbuilt. Nothing can report until it exists.

- `apps/standards`: launch endpoint for `unity` / `cmi5` lessons returning
  `{ auUrl, endpoint, fetch, actor, registration, activityId }`, reusing the `Launch`
  model and membership checks the SCORM path already has.
- One-time `fetch` URL → short-lived, tenant-scoped token.
- xAPI statements endpoint: Bearer auth, tenant stamped server-side, idempotent on
  statement id.
- `completed` / `passed` / `failed` reflected into the enrollment and gamification.
- Wire `forge-cmi5-launcher` and `forge-unity-embed` to the new endpoints.

**Exit:** a stub HTML AU launched from the learner app completes a lesson end to end,
with tests covering cross-tenant rejection and token replay.

### Phase 2 — Unity core package and WebGL vertical slice (about 2–3 weeks)

> **Core slice built 2026-11-20.** The Unity project `games/forge-unity` (Unity
> 6000.6.10f1, URP), the package `Packages/com.soteriaforge.core` (launch parsing,
> fetch exchange, ordered statement delivery with retry) with 18 EditMode tests, and
> the lockout drill test scenario. The drill was built for WebGL (13 MB) and run in
> Chrome against a local API: it fetched its token, sent 11 statements and completed
> the lesson with a score of 80. Not yet done: the run inside the learner app's
> iframe on staging, quality tiers and the shared UI kit. This settles two Phase 0
> questions for now: the Unity version, and the project living in this repo.

- `com.soteriaforge.core` Unity package: read launch params, fetch exchange,
  statement emitter (`initialized` → `completed` / `passed` / `failed`), offline queue
  with retry, pause / resume and final statement on quit.
- Quality tiers (mobile high, mobile low, WebGL) and a shared UI kit matching the
  design system.
- A deliberately small test scenario built on the package.

**Exit:** the test scenario, as a WebGL build in `forge-unity-embed`, completes a real
lesson against staging.

### Phase 3 — Native mobile embedding (about 3 weeks)

- Android: Unity library module in `mobile/android`; `unity` lessons launch it with
  natively passed launch params.
- iOS: Unity framework in `mobile/ios`; same launch path.
- Addressables hosted in tenant storage, with download progress, caching and a
  storage-full path.
- Offline: statements queue on device and flush on reconnect.

**Exit:** the Phase 2 scenario completes a lesson on a physical iPhone and a physical
Android phone at the minimum-spec device, including one run started offline.

### Phase 4 — `forge-sim` and server-verified scoring (about 2–3 weeks)

> **Server side built 2026-11-20.** The `forge-sim` crate with its C and Python
> bindings, and the replay wired into the cmi5 statements endpoint: a lesson with a
> scenario attached is scored from the action log, and a tampered score is discarded
> and audited (`backend/tests/test_cmi5_sim.py`). The Unity package sends the log and
> the drill uses it; the drill and Django read the same scenario file. Not yet done:
> forge-sim built into a Unity player (the drill still estimates its own score in C#
> for display), the wheel in the API image, a WebGL run of the drill against a
> scenario lesson, and replaying logs recorded under an older rules version.

- `forge-sim` Rust crate: scenario state machine, rule evaluation, scoring. No I/O.
- C# bindings for Unity (native library on iOS / Android; WebGL per the Phase 0 result).
- Python wheel (PyO3 + maturin) added to `backend/pyproject.toml`.
- The final statement carries the action log; Django replays it and records the
  replayed score. A mismatch is audited and the client score is discarded.
- Scenario data format, versioned, with a validator shared by Unity and Django.

**Exit:** a tampered client score is rejected in a test, and the same scenario file
produces identical results in Unity and in Django.

### Phase 5 — First real workplace simulator (about 4–6 weeks plus art)

- One procedure chosen with a safety subject-matter expert, with learning objectives
  mapped to observable in-sim actions.
- Two or three scenarios on one environment, each its own lesson.
- Admin: attach a simulator scenario to a lesson; reports show per-objective results.
- Accessibility pass and an alternative path for learners who cannot use the sim.

**Exit:** a pilot cohort completes the simulator lessons on their own phones.

### Phase 6 — Server saves and shared RPG systems (about 3 weeks)

- xAPI State API in `apps/standards`: per-learner, per-activity documents with
  optimistic concurrency, so a save from a phone and a save from the web cannot
  silently overwrite each other.
- Core package: save / load, dialogue, inventory, quest tracking.
- Character level and unlocks read from `apps/gamification`.

**Exit:** a learner starts on a phone, continues on the web, and keeps their state.

### Phase 7 — RPG vertical slice (about 6–8 weeks plus art and writing)

- One hub area and three quests, each quest a lesson with its own objectives.
- Quest completion driven by demonstrated objectives, verified by `forge-sim`.
- Content pipeline for writers: quests and dialogue as data.

**Exit:** one course delivered as an RPG chapter, played by a pilot cohort.

### Phase 8 — Content scale and operations (ongoing)

- Authoring tools for scenarios and quests in the admin app.
- Per-tenant scenario packs and versioning with rollback.
- Performance budgets in CI, crash reporting, analytics on drop-off points.

## 4. Dependencies between phases

```
0 ─► 1 ─► 2 ─► 3 ─► 5 ─► 6 ─► 7 ─► 8
          └──► 4 ──┘
```

Phase 4 can run alongside Phase 3 once Phase 2 is done. Phases 5 and 7 are gated by art
and content production more than by engineering.

## 5. Risks

| Risk                                            | Mitigation                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| Rust will not link cleanly into Unity WebGL     | Phase 0 spike; fallback keeps Rust on native and the server                       |
| Older Android phones cannot run the high tier   | Minimum device set in Phase 0; low tier tested on that device every phase         |
| App size and iOS memory after embedding Unity   | Addressables from the start; measure in Phase 3 before any real content exists    |
| App-store release needed for every new mechanic | Data-driven scenarios; batch mechanics into planned releases                      |
| RPG content cost outruns the team               | RPG starts only after a simulator has shipped; slice is three quests, not a world |
| Two progression systems confuse learners        | Decision 5: RPG level is a view of platform XP                                    |
| Simulator trains the wrong behaviour            | Subject-matter expert sign-off on objectives and scoring before Phase 5 build     |

## 6. Open questions

1. Minimum supported devices (drives the art budget and reach).
2. Unity project in this repo or a separate one.
3. Who produces 3D art, and to what style: realistic or stylised.
4. Which procedure is the first simulator, and who is the subject-matter expert.
5. Unity licensing tier for the organisation.
