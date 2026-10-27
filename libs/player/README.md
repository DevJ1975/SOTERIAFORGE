# @assurance/player

Content player helpers for Soteria Assurance. The learner app renders lessons itself
(`apps/learner`, backed by the Forge API); this library keeps the reusable pieces.

## Public API

### Components

- **`VideoPlayerComponent`** (`forge-video-player`) — Renders YouTube/Vimeo URLs as sandboxed responsive iframes; plain URLs as HTML5 `<video controls>`. Signal inputs: `url` (required), `title` (optional). Outputs: `progress` (0-100), `completed`.

### Services

- **`DownloadService`** — "Download for offline": detects cacheable (same-origin) module assets, stores them in Cache Storage and records a per-course manifest in IndexedDB, guarded by a storage quota check.

### Utilities

- **`detectVideoKind(url)`** — Pure function. Returns `'youtube' | 'vimeo' | 'file'`.
