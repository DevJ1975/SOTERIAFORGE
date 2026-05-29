# @forge/player

Content player library for Soteria FORGE.

## Public API

### Components

- **`VideoPlayerComponent`** (`forge-video-player`) — Renders YouTube/Vimeo URLs as sandboxed responsive iframes; plain URLs as HTML5 `<video controls>`. Signal inputs: `url` (required), `title` (optional). Outputs: `progress` (0-100), `completed`.
- **`ModulePlayerComponent`** (`forge-module-player`) — Dispatcher component that renders the correct player based on `module().contentType`. Signal inputs: `module`, `courseId`, `tenantId`, `uid`. Injects `EnrollmentService` to persist SCORM CMI data via `saveCmi`.
- **`GamePlayerComponent`** (`forge-game-player`) — Loads a `Game` record from `GameRepository` and renders the appropriate engine component (`forge-phaser-host` for Phaser/PixiJS games, `forge-rive-character` for Rive games). Signal inputs: `gameId`, `courseId`, `moduleId`, `tenantId`, `uid`. Calls `PlayerProgressService.recordCompletion` on the `completed` event. OnPush, SSR-safe (skips Firestore on the server).

### Services

- **`PlayerProgressService`** — Bridges player events to LMS (`EnrollmentService`) and xAPI (`XapiClient`). Methods: `recordProgress(ctx, pct)`, `recordCompletion(ctx, score?)`.

### Utilities

- **`detectVideoKind(url)`** — Pure function. Returns `'youtube' | 'vimeo' | 'file'`.

## Content Types

| Type  | Status                                  |
| ----- | --------------------------------------- |
| video | Phase 2 (implemented)                   |
| scorm | Phase 3 (implemented)                   |
| cmi5  | Phase 3 (implemented)                   |
| unity | Phase 3 (implemented via cmi5-launcher) |
| quiz  | Phase 4 (implemented)                   |
| game  | Phase 5 (implemented via GamePlayerComponent) |

## SCORM / cmi5 Integration

`ModulePlayerComponent` renders `forge-scorm-player` for `contentType: 'scorm'` modules
and `forge-cmi5-launcher` for `contentType: 'cmi5'` and `contentType: 'unity'` modules.
Both player components are loaded inside `@defer` blocks.

- **SCORM**: the `commit` output calls `EnrollmentService.saveCmi` on every runtime commit;
  the `completed` output calls `PlayerProgressService.recordCompletion` with the reported score.
- **cmi5 / Unity**: the AU sends xAPI statements directly to the LRS. The `completed` output
  is a lightweight side-channel that calls `PlayerProgressService.recordCompletion`.
