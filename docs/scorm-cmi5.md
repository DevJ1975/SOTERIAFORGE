# SCORM, cmi5 & xAPI — runtime and authoring flow

Phase 3 wires standards-based content into the unified player. This documents
how a package goes from upload to launch to reporting.

## Components (`@assurance/standards`)

- `parseImsManifest(xml)` — parses `imsmanifest.xml` → `{ title, scormVersion,
launchHref }`.
- `ScormPlayerComponent` (`forge-scorm-player`) — mounts the `scorm-again` API on
  `window` (via `ScormRuntimeService`) **before** loading the SCO in a sandboxed
  iframe, so the SCO finds the API. Emits `commit` (cmi data) and `completed`
  (`{completed, score?}`).
- `Cmi5LauncherComponent` (`forge-cmi5-launcher`) — builds the cmi5 launch URL
  (`buildLaunchUrl`) and renders the AU in a sandboxed iframe. The AU posts xAPI
  to the LRS itself with the fetched token.
- `XapiClient` — builds tenant-stamped statements, `send()` → `ingestStatement`
  callable (Firestore LRS v1).

## Player wiring (`@assurance/player` → `ModulePlayerComponent`)

`@switch (module.contentType)`:

- `video` → `forge-video-player`
- `scorm` → `forge-scorm-player`; `commit` → `EnrollmentService.saveCmi(...)`
  (persists to `enrollment.cmi.runtime[moduleId]`), `completed` →
  `PlayerProgressService.recordCompletion(ctx, score)` (enrollment + xAPI)
- `cmi5` / `unity` → `forge-cmi5-launcher`; `completed` → `recordCompletion`
- `quiz` / `game` → placeholders (Phases 4 / 5)

All sub-players are `@defer`-loaded and SSR-safe.

## Authoring & registration flow

1. **Upload** the package `.zip` (or Unity WebGL build) to Cloud Storage under
   `tenants/{tenantId}/scorm/{packageId}/…` (author-gated by `storage.rules`).
2. **Resolve the launch URL**:
   - SCORM: unzip the package (see below), read `imsmanifest.xml`, run
     `parseImsManifest` to get `launchHref`; the launch URL is the signed/served
     URL of `{packageId}/{launchHref}`.
   - cmi5/Unity: the AU's `index.html` URL is the launch base.
3. **Author a module** (`contentType: 'scorm' | 'cmi5' | 'unity'`,
   `externalUrl` = launch URL) via the admin course-editor /
   `CourseAuthoringService.addModule`. Module writes are author-gated by
   `firestore.rules` — no privileged function required.

## Live-infra piece (not exercisable in CI)

Server-side **unzip-on-upload** is the one part requiring live Cloud Storage: a
Storage-triggered function that, when a `.zip` lands in `scorm/uploads/`,
expands it to `scorm/{packageId}/`, validates `imsmanifest.xml`, and records the
launch href. It needs a zip library + a real bucket, so it is documented here
and deferred to deployment wiring rather than stubbed untested. Until then,
authors can point a `scorm` module directly at a pre-extracted launch URL.

## Reporting

- SCORM `cmi.*` runtime persists per module in `enrollment.cmi.runtime`.
- Completion/score mirror to xAPI (`completed`/`passed`/`failed`) and update
  `enrollment` (progress, score, completion).
- cmi5/Unity AUs report xAPI directly to the LRS endpoint; Assurance reflects the
  result into enrollment + gamification (Phase 4).
- Every statement is tenant-stamped (`context.extensions[...tenantId]`),
  server-authoritative via `ingestStatement`.
