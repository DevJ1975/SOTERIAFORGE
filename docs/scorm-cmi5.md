# SCORM imports and external xAPI reporting

## Implemented pilot

The Django-backed learner route supports managed **SCORM 1.2 and single-SCO
SCORM 2004** lessons. The admin console's **SCORM and xAPI** page uploads,
shows processing errors, attaches ready versions as new lessons, archives
versions, and shows configuration and the most recent 100 outbox deliveries.
Package lists show the latest 200 versions.

Versions are immutable; uploading a replacement creates a new package. Existing
lessons and learner bookmarks stay pinned to their original package. Attach the
new version as a new lesson rather than changing an in-progress lesson's content.
Archive revokes playback, including already-issued launches, but retains objects
for audit/retention. There is no automatic object deletion or retention job yet;
set an organizational retention policy before production use.

This is an import/playback pilot, **not an LMS exporter, certified SCORM LMS,
complete LRS, or completed cmi5 integration**. (cmi5 / Unity lessons have their own
launch, fetch and statement intake: see [unity-cmi5-contract.md](./unity-cmi5-contract.md) §5.) Multi-SCO navigation, sequencing,
resource dependencies, `xml:base`, launch query parameters/fragments, externally
hosted assets, offline package playback, cmi5 launch/fetch/state/lifecycle and
arbitrary browser xAPI statement ingestion are not supported. Unsupported
manifest structures are rejected explicitly.

The managed Django path is the only storage, authorization, completion and
reporting path for SCORM lessons. Non-managed external-link lessons are unchanged.

## Architecture

- `POST /api/standards/packages`: tenant staff upload a ZIP, maximum 50 MB.
  The original goes to a private Railway Bucket; the database records a SHA-256.
- `python manage.py process_scorm`: processes at most five pending packages per
  run. ZIP/XML parsing and temporary extraction run in a spawned child process:
  30-second wall timeout, 15-second CPU budget, 768 MB address-space limit on
  Linux. Limits: 2,000 entries, 200 MB expanded, 25 MB per file, 1 MB manifest,
  200:1 member compression ratio. Traversal, encoded paths, symlinks, encryption,
  duplicate filenames, unsafe XML/entities and unsupported manifests fail closed.
  Extracted objects are published only after validation; failures are visible.
  Interrupted processing older than ten minutes becomes failed; reupload it.
- `POST /api/standards/packages/{id}/attach`: adds a SCORM lesson to a tenant's
  existing Django course module. Create the module with the Django course
  authoring API (the admin course editor uses it).
- `POST /api/standards/lessons/{id}/launch`: requires active membership, a published
  course and enrollment. Issues a two-hour read-only content capability. A new
  launch revokes the prior launch for that enrollment/lesson and restores its CMI.
- A **separate content-only Django service/origin** serves the runtime wrapper
  and private relative package assets. `scorm-again` 3.0.5 runs there, so the SCO
  can find its same-origin parent API. It never runs on the authenticated Angular
  or API origin. The content URLconf has no authenticated API/admin routes.
- The wrapper exchanges messages with Angular. Both sides check origin, window
  source and launch ID. Access tokens and LRS credentials never enter the
  package origin. Iframes cannot navigate the top window or open popups; CSP
  blocks external assets/connections, workers, plugins, and unauthorized framing.
- `POST /api/standards/launches/{id}/commit`: the authenticated Angular parent
  persists nested `{cmi: {...}}` snapshots. Commits must be ordered; a retry of the
  most recent sequence with identical content returns its stored result. A reused
  sequence with different data is rejected. Enrollment locks serialize updates.
  CMI has a 64 KB serialized limit. Saves debounce after value changes and retry
  every 15 seconds while pending. Failed saves are displayed with explicit retry;
  leaving with unsaved changes triggers a browser/router warning.
- SCORM 1.2 `passed`/`completed` completes the lesson; SCORM 2004 uses
  `completion_status=completed` independently of success status. Finish/Terminate
  alone does **not** complete it. SCORM 1.2 score ranges normalize to percentages;
  2004 negative scaled scores remain in CMI but normalize to zero in the existing
  nonnegative progress model. Native completion/runtime endpoints cannot bypass
  the managed launch.

SCORM evidence is browser-reported, **not independent proof of learning or
anti-cheat certification evidence**. Package JavaScript is untrusted. Upload
only reviewed content you have permission to use. The resource-limited parser is
not a full OS sandbox or malware scanner; run processing in its own non-root,
resource-constrained service. Do not expose private inference/admin credentials
or unnecessary outbound privileges to that worker.

## Railway configuration

No live Railway resources are created by this implementation.

1. Attach/create the private Railway Bucket in your project. Copy its actual
   generated S3 values into **secret Railway service variables**, not chat,
   Angular bundles, source control, or shared screenshots:

   ```dotenv
   STANDARDS_S3_ENDPOINT=https://<bucket-s3-endpoint>
   STANDARDS_S3_BUCKET=<bucket-name>
   STANDARDS_S3_ACCESS_KEY=<access-key>
   STANDARDS_S3_SECRET_KEY=<secret-key>
   STANDARDS_S3_REGION=auto
   ```

   The adapter uses SigV4/path-style addressing with bounded network timeouts.
   The bucket stays private; no public object ACL or browser S3 credentials.
   Objects live below `standards/{tenant}/{package}/upload.zip` and `files/...`.

2. Deploy the API image normally from `backend/`. Its Dockerfile installs the
   pinned JavaScript runtime in a Node build stage and copies only the runtime
   distribution into the Python image. Run migrations as database owner and
   `ensure_app_role` to grant new tables to the RLS-bound runtime role.

3. Add a content-only service from the **same backend image/source**. Give it a
   dedicated hostname, preferably a separate registrable domain with no app
   cookies or identity-provider authorized domains. Never proxy its package
   routes onto `api.soteriaforge.com` or an Angular application origin. Set:

   ```dotenv
   DJANGO_SETTINGS_MODULE=forge.settings_content
   DJANGO_ALLOWED_HOSTS=<content-hostname>
   STANDARDS_CONTENT_ORIGIN=https://<content-hostname>
   STANDARDS_APP_ORIGINS=https://<exact-learner-origin>,https://<another-approved-origin>
   STANDARDS_ENABLED=true
   ```

   Share the API's `DJANGO_SECRET_KEY` (content capability verification), database
   connection/runtime role, and bucket variables securely. Do not give the
   content service any LRS authorization credentials.
   Default Docker start command and `/healthz` work with either settings module.
   Set the same content/app origin variables on the API. Do not use wildcard
   framing origins. Cap content-service resources and configure trusted proxy/
   TLS headers correctly. Tokens expire after two hours; relaunch to resume.

4. Add an isolated processing cron service using the backend image:
   `python manage.py process_scorm`. Run regularly (e.g. every minute), using the
   same database/bucket values. Do not use `DB_USE_OWNER=1` for workers.
   The command explicitly enters the repository's administrative RLS bypass
   scope for cross-tenant processing. Keep it inaccessible to public callers.

5. After storage and content-origin checks succeed, enable `STANDARDS_ENABLED`
   on API/content services. Upload a small test package, run the worker, attach
   it, publish/enroll, and check Chrome save/resume. Do not enable a whole tenant
   until real exports from the actual authoring tool have passed compatibility
   testing. Admin configuration flags indicate values are present, **not** that
   connectivity or compatibility has been proven.

## Existing external LRS

Completion of any Django lesson, including native quiz/check grading and SCORM,
can atomically enqueue one xAPI `completed` statement alongside authoritative
progress and XP. Browser telemetry, individual quiz interactions, failed attempts
and cmi5 statements are not yet exported. There is no IndexedDB/offline replay
of these server events.

Enable recording only after selecting the destination and tenant data policy:

```dotenv
XAPI_RECORDING_ENABLED=true
XAPI_ACTIVITY_BASE=https://soteriaforge.com/xapi
XAPI_LRS_ENDPOINT=https://<existing-lrs>/<xapi-base>
XAPI_LRS_AUTH=<complete-secret-Authorization-header>
```

Keep the activity base stable after first use. Statement actors use pseudonymous
membership UUID accounts, not email/name, and context includes tenant UUID/slug
and enrollment registration. These still constitute learner data; the external
LRS must enforce tenant access and retention appropriately. This initial adapter
targets **xAPI 1.0.3**; confirm the supplied LRS supports it before enabling.

Add a delivery cron service using `python manage.py forward_xapi`. Give **only
that service** `XAPI_LRS_AUTH`; the API only needs recording enabled. The admin
configuration flag for LRS credentials is service-local, so an API without
delivery credentials correctly shows not configured even if the worker has
them. Per-event delivery status is authoritative.

The command delivers at most 50 due rows per run with `PUT /statements?statementId=...`,
stable UUID/payload, `X-Experience-API-Version: 1.0.3`, verified HTTPS, no redirects,
and bounded timeouts. Only the LRS's successful **204** marks delivery. Timeouts/
non-204 results remain pending with capped exponential backoff and an explicit
sanitized operator-visible error. Row locks exclude simultaneous workers;
a lost response retries the same immutable statement. This gives at-least-once
transport with LRS idempotency, not an impossible exactly-once network guarantee.
Correct permanent 4xx/configuration failures; they remain visible and retryable.

Missing endpoint/credentials makes the delivery command fail explicitly.
Recording is disabled by default; enabling it without a worker intentionally
accumulates pending rows and needs monitoring. Set alerts on oldest pending row,
failures, storage use and worker health before production rollout.

## Local verification

```sh
cd backend
uv sync
npm ci --prefix runtime --ignore-scripts
DB_USE_OWNER=1 uv run --env-file .env python manage.py migrate --noinput
DB_USE_OWNER=1 uv run --env-file .env python manage.py ensure_app_role
uv run pytest tests/test_standards.py tests/test_learning.py tests/test_rls.py --reuse-db
SCORM_BROWSER=1 uv run pytest tests/test_standards.py --reuse-db
```

Chrome smoke tests use the installed Google Chrome, a real pinned SCORM runtime,
the rendered Django wrapper, and temporary HTTP servers on separate local
origins. They exercise bookmark, incomplete exit, resume and explicit completion
for both versions, then apply observed snapshots to the real Django commit API.
Unit tests separately cover the actual Angular bridge and authoring UI.
This is synthetic compatibility evidence, not proof for every vendor export.

For manual development set `DJANGO_DEBUG=true`,
`STANDARDS_LOCAL_ROOT=<absolute-private-temp-directory>`,
`STANDARDS_CONTENT_ORIGIN=http://localhost:8001`, and approved learner origins
(e.g. `http://localhost:4200`). Start the normal API on 8000 and the content
service on 8001 with `DJANGO_SETTINGS_MODULE=forge.settings_content`. Each
needs the same `.env`, storage root and signing key. Run `process_scorm`
separately. Never use filesystem storage as the production Railway backend.
