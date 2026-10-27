# WebMCP course-content tools (admin app)

The admin app exposes course authoring to in-browser AI agents through
[WebMCP](https://github.com/webmachinelearning/webmcp), using Angular 22's
experimental `provideExperimentalWebMcpTools()`. An author opens
`/courses` in Forge admin, and an agent running in that browser can then read
and edit course content as that author.

Code: `apps/admin/src/app/webmcp/` (registered by `apps/admin/src/app/courses.routes.ts`).

## Tools

| Tool                        | What it does                                                                           | Writes? |
| --------------------------- | -------------------------------------------------------------------------------------- | ------- |
| `forge_list_courses`        | All courses in the tenant with id, title, status, tags                                 | No      |
| `forge_get_course`          | One course plus its modules in learner order                                           | No      |
| `forge_create_course_draft` | New course, always `draft`                                                             | Yes     |
| `forge_update_course`       | Title, description, tags, XP, offline availability                                     | Yes     |
| `forge_add_module`          | Append a module (video URL, quiz/game id, cmi5, SCORM, Unity)                          | Yes     |
| `forge_update_module`       | Title, URL, minutes, XP, completion rules                                              | Yes     |
| `forge_reorder_modules`     | New learner order (must list every module once)                                        | Yes     |
| `forge_upload_module_video` | Upload a video (https URL ≤ 500 MB, or base64 ≤ 10 MB) and make it the module's source | Yes     |

## Guardrails

- **Runs as the signed-in user.** Tools check that the user may author in the
  tenant resolved from the host. The agent never supplies a tenant id.
  Firestore and Storage rules enforce the same thing server-side.
- **No publish, unpublish, archive or delete.** Agents draft and edit; a human
  publishes in the course editor. A spec asserts no such tool exists.
- **Edits to published courses are live.** `forge_update_course` and
  `forge_update_module` say so in their descriptions, and write tools carry
  `consequentialHint`. Read tools carry `untrustedContentHint` because course
  text is author-supplied.
- **Arguments are re-validated with zod**; the JSON schemas are hints for the
  agent. URLs must be `https://`; uploads must be `video/*`.
- **Lifecycle:** tools register when an author enters `/courses` and are
  removed when that route's injector is destroyed. On the server (SSR) and in
  browsers without `navigator.modelContext`, registration is a no-op.

## Limits and follow-ups

- The API is **experimental** in Angular 22.2 and the WebMCP spec is still
  changing; expect renames on Angular upgrades.
- An agent needs a browser that implements `navigator.modelContext` (or a
  WebMCP polyfill plus an agent extension). Check current browser support before
  relying on it in a session.
- The open course editor does not live-refresh; reload to see agent edits.
- SCORM/cmi5 package upload is not exposed yet: the existing SCORM pipeline
  extracts packages but never resolves a launch URL for the player.
- Uploads go to Firebase Storage for now. Phase 2 of
  `docs/forge-platform-plan.md` swaps `CourseAssetUploader` for Django-issued
  signed URLs, and the tools keep working because they only call
  `CourseAuthoringService` and the uploader.
