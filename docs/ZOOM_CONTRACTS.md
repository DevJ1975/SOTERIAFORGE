# Zoom Live Sessions — Build Contracts (authoritative)

Add live webinars/sessions: an instructor/admin schedules a Zoom session (optionally on a course);
learners see upcoming/live/past and **join via a link**; recordings surface after. Settled choices:
**join-links**, **configurable type (default `meeting`)**, **full vertical**, **Zoom calls mocked
when creds absent**. Branch: `claude/nice-heisenberg-90bs5f` (even with `main`); new draft PR.

## Security model (must hold)

- The host **`start_url` is sensitive** and is NEVER on the learner-readable session doc. It lives in
  an authoring-only private subdoc `/tenants/{t}/liveSessions/{id}/private/host` and is returned only
  by the `getHostStartUrl` callable to an authorized host.
- All `/liveSessions/**` writes are **Cloud-Functions-only** (`allow write: if false`).
- Callables derive `tenantId` + `hostUid` from the **verified caller claims**, never from request data.
- The webhook **verifies the Zoom HMAC signature** before mutating anything.

## Frozen contracts (do not diverge)

### 1. Schema (Z1) — `libs/shared`

`schemas/constants.ts` (or wherever ROLES live): `export const LIVE_SESSION_TYPES = ['meeting',
'webinar'] as const;` + type; `export const LIVE_SESSION_STATUSES = ['scheduled','live','ended',
'canceled'] as const;` + type.
New `schemas/live-session.ts`:

```ts
export const liveSession = auditable.extend({
  id: docId,
  tenantId,
  courseId: docId.optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).default(''),
  type: z.enum(LIVE_SESSION_TYPES).default('meeting'),
  status: z.enum(LIVE_SESSION_STATUSES).default('scheduled'),
  scheduledStart: isoDateTime,
  durationMin: count,
  hostUid: uid,
  meetingId: z.string().optional(),
  joinUrl: z.string().url().optional(),
  passcode: z.string().optional(),
  recordingUrl: z.string().url().optional(),
  recordingId: z.string().optional(),
}); // NOTE: NO startUrl here.
```

Export from `libs/shared/src/index.ts`.

### 2. Firestore paths

- `/tenants/{tenantId}/liveSessions/{sessionId}` — `liveSession` (learner-readable).
- `/tenants/{tenantId}/liveSessions/{sessionId}/private/host` — `{ startUrl: string }` (authoring-only).

### 3. data-access (Z1) — `collections.ts`

`liveSessionsCol(db, tenantId)` / `liveSessionDoc(db, tenantId, sessionId)` via
`zodConverter(liveSession)` (mirror `coursesCol`/`courseDoc`).

### 4. firestore.rules (Z1) — under `match /tenants/{tenantId}`

```
match /liveSessions/{sessionId} {
  allow read: if isSuperadmin() || inTenant(tenantId);
  allow write: if false;
  match /private/{docId} {
    allow read: if isSuperadmin() || (inTenant(tenantId) && isAuthoring());
    allow write: if false;
  }
}
```

- rules tests (member reads session; cross-tenant denied; client write denied; learner CANNOT read
  `private/host`; authoring CAN) in `libs/data-access/src/rules/firestore.rules.spec.ts`.

### 5. Callable names + I/O (Z2 implements; Z4 admin consumes via httpsCallable)

`tenantId`/`hostUid` come from caller claims (tenant_admin/instructor/superadmin). Roles other than
those → `permission-denied`.

- `scheduleLiveSession(data: { courseId?, title, description?, type?: 'meeting'|'webinar',
scheduledStart: ISO-8601, durationMin: number }) → { sessionId, joinUrl, status: 'scheduled' }`
  (NO startUrl). Throws `unavailable` if `deps.zoom` is null (Zoom not configured).
- `cancelLiveSession(data: { sessionId }) → { sessionId, status: 'canceled' }`.
- `getHostStartUrl(data: { sessionId }) → { startUrl }` (reads the private subdoc; authz host/admin).
- HTTP `zoomWebhook` — HMAC-verify; `meeting.started→live`, `meeting.ended→ended`,
  `recording.completed→recordingUrl/recordingId`.

### 6. ZoomPort (Z2) — `apps/functions/src/lib`

`ports.ts`: `ZoomPort { createMeeting(opts) → { meetingId, joinUrl, startUrl, passcode? };
getMeeting(id); deleteMeeting(id) }`; extend `DbPort` with `getLiveSession/setLiveSession/
setLiveSessionPrivate/deleteLiveSession/getCourse`; add `zoom?: ZoomPort` to `CorePorts`.
`adapters.ts`: `createZoomAdapter(): ZoomPort | null` — Server-to-Server OAuth (cached token) + REST
(`type:meeting` default; `webinar` via the webinars endpoint); **returns `null` when any of
`ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET` is absent**. `fakes.ts`: `FakeZoomPort`
(deterministic ids/urls) wired into `makeFakes()` so all tests use a working mock.

### 7. Functions client (Z3) — `libs/auth/src/lib/firebase.providers.ts`

Add `provideFunctions(() => getFunctions())` + `connectFunctionsEmulator(localhost, 5001)` under the
same `isLocalHost()` latch as the existing `provideStorage`. Export. Both app configs already call
`provideForgeFirebase()` — no per-app change.

### 8. Seed (Z5) — `tools/seed`

2–3 ATL example `liveSession` docs (one upcoming, one `live`, one `ended` w/ `recordingUrl`), one
linked to a course; validated via the schema; mock `joinUrl`s. Update the seed README.

## Ownership lanes (no cross-lane edits; no git; orchestrator owns package.json/.github)

| Lane                               | Owns                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Z1 — Schema/data/rules** (FIRST) | `libs/shared` (constants + `schemas/live-session.ts` + index); `libs/data-access/src/lib/collections.ts`; `firestore.rules`; `libs/data-access/src/rules/firestore.rules.spec.ts`                                   |
| **Z2 — Functions/Zoom**            | `apps/functions/src/main.ts`; `apps/functions/src/lib/{ports,adapters,fakes,errors,authz,audit-log}.ts`; new `schedule-live-session.core.ts`, `cancel-live-session.core.ts`, `get-host-start-url.core.ts` (+ specs) |
| **Z3 — Functions client**          | `libs/auth/src/lib/firebase.providers.ts` (+ index export)                                                                                                                                                          |
| **Z4 — Admin UI**                  | `apps/admin/src/app/live-sessions/**` (new); `apps/admin/src/app/app.routes.ts`; admin nav                                                                                                                          |
| **Z5 — Learner UI + seed**         | `apps/learner/src/app/features/live-sessions/**` (new); `apps/learner/src/app/app.routes.ts`; `home.ts` + nav; `tools/seed/**`                                                                                      |

**Sequencing:** Z1 + Z3 (Wave 1) → Z2, Z4, Z5 (Wave 2). Z4/Z5 import Z1's data-access + schema; Z4
calls Z2's callables (frozen names §5) and Z3's Functions client; Z2 imports Z1's `liveSession` for
validation. Z3 edits `firebase.providers.ts`; Z2 edits functions only — disjoint.

## Honest not-run

Real Zoom meeting creation/webhooks need `ZOOM_*` secrets + a public webhook URL + (for `webinar`)
the paid Webinar add-on — not exercised here; emulator/CI/demo use the mock adapter. Secrets are
bound to deployed functions via env/Secret Manager. The connected Zoom MCP (reads the user's own
Zoom) is NOT used by this feature.

## Conventions

Zod in `@forge/shared`; Firestore I/O via data-access converters (apps) / DbPort (functions); deny-by-
default rules + tests ship with new paths; functions keep the ports/adapters/fakes + `*.core.ts` +
`*.core.spec.ts` pattern; design tokens only; Prettier (single quotes/width 100/trailing commas); nx
module boundaries. Self-check each owned project (`NX_DAEMON=false npx nx lint/test/build <proj>`;
`npm run test:rules` for Z1).
