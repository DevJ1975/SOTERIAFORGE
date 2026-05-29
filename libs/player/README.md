# @forge/player

Phase 2 content player library for Soteria FORGE.

## Public API

### Components

- **`VideoPlayerComponent`** (`forge-video-player`) — Renders YouTube/Vimeo URLs as sandboxed responsive iframes; plain URLs as HTML5 `<video controls>`. Signal inputs: `url` (required), `title` (optional). Outputs: `progress` (0-100), `completed`.
- **`ModulePlayerComponent`** (`forge-module-player`) — Dispatcher component that renders the correct player based on `module().contentType`. Signal inputs: `module`, `courseId`, `tenantId`, `uid`.

### Services

- **`PlayerProgressService`** — Bridges player events to LMS (`EnrollmentService`) and xAPI (`XapiClient`). Methods: `recordProgress(ctx, pct)`, `recordCompletion(ctx, score?)`.

### Utilities

- **`detectVideoKind(url)`** — Pure function. Returns `'youtube' | 'vimeo' | 'file'`.

## Content Types

| Type  | Status                |
| ----- | --------------------- |
| video | Phase 2 (implemented) |
| scorm | Phase 3 (placeholder) |
| cmi5  | Phase 3 (placeholder) |
| unity | Phase 4 (placeholder) |
| quiz  | Phase 4 (placeholder) |
| game  | Phase 5 (placeholder) |
