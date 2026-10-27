# Forge Engage video classrooms

The learner app's `/engage` route uses our Angular classroom UI and a self-hosted
LiveKit WebRTC SFU. Django authorizes access and signs media credentials; it does
not relay audio/video. This replaces the draft plan's Zoom Video SDK integration.

## Initial scope

- Instructors, tenant admins and superadmins acting in a tenant can create rooms.
- Active members can list and join classrooms **within their acting tenant**.
  Rooms are tenant-wide, not yet restricted to a course, section or cohort.
- The SFU enforces a 21-participant limit, including instructors. This is a
  configured limit, **not a load-tested capacity guarantee**.
- Participants join with microphone and camera off. Controls enable/mute the
  microphone, enable/disable the camera, and leave the room.
- Staff can share their screen; learners cannot publish screen-share tracks.
- Connection/reconnection state, permission failures and media outages are shown
  in the UI. A user-gesture audio button handles Chrome autoplay restrictions.
- Leaving or navigating away disconnects media and releases local tracks.

Classroom definitions persist in Postgres with tenant RLS. Creating a classroom
also writes an audit entry. The LiveKit room is provisioned when someone joins;
empty media rooms expire, but the classroom definition remains reusable.

Not included yet: scheduling/closing rooms, cohort rosters, device selection or
pre-join preview, attendance tracking, chat/polls, hand raising, host moderation,
recording, captions or breakout rooms. Do not treat media connection logs as an
attendance record.

## Chrome defaults

Use current desktop Google Chrome over HTTPS (localhost is allowed for development).
No browser flags or extensions are needed in normal use.

- Camera capture: up to 1280x720 at 30 fps, using VP8 with 180p/360p simulcast
  layers. Adaptive subscriptions select video resolution based on rendered size;
  dynacast pauses unused layers.
- Microphone: mono speech, echo cancellation, noise suppression, automatic gain
  control, Opus speech encoding with DTX and redundant audio. Muting releases the
  microphone capture track.
- Screen sharing: up to 1920x1080 at 15 fps, with a detail-oriented content hint.
  Chrome's sharing picker excludes the current tab and permits switching tabs.
  Screen audio is not requested by the current UI.
- Screen sharing is capability-detected; unsupported browsers show guidance.
  Chrome on mobile does not offer the same capture controls as desktop Chrome.

Camera/microphone permissions can be changed through Chrome's site settings.
Screen sharing always requires the browser's picker. Closing that picker without
selecting a surface produces an explicit error and leaves the classroom connected.

## Local setup

From the repository root:

```bash
npm install
cd backend
uv sync
docker compose --profile media up -d --wait
```

In the backend's local `.env`, add the values from
[`.env.example`](../backend/.env.example):

```dotenv
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_URL=http://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

The short key/secret are **LiveKit's public development defaults**, used only by
the loopback-bound local service. Never deploy them to an accessible server.

Apply migrations as the database owner, then refresh runtime role grants:

```bash
DB_USE_OWNER=1 uv run --env-file .env python manage.py migrate
DB_USE_OWNER=1 uv run --env-file .env python manage.py ensure_app_role
uv run --env-file .env python manage.py runserver 8000
```

Start the learner app with `npm run start:learner` from the repository root.
Use your existing Firebase/Auth emulator configuration and tenant-member sign-in.
Open `/engage` on that tenant's learner hostname. Instructors create rooms there;
learners join from the same page. This feature does not create test accounts or
bypass existing authentication.

Local media ports are bound to loopback: 7880/TCP (signaling/API), 7881/TCP
(WebRTC fallback) and 7882/UDP (WebRTC). The development service advertises
127.0.0.1 and is intentionally for browsers on this machine, not remote learners.
Check readiness with `curl --fail http://localhost:7880/`.

Stop only the opt-in media service when finished:

```bash
docker compose --profile media stop livekit
```

## Production requirements

1. Deploy the pinned LiveKit server from
   [`backend/docker-compose.yml`](../backend/docker-compose.yml) on infrastructure
   with supported public UDP/TCP routing. Do not use its `--dev` configuration.
   A Vercel function or Django worker is not a media host; verify your chosen
   provider supports LiveKit's network requirements.
2. Provide a trusted TLS certificate and a public `wss://` media hostname.
   Configure LiveKit's public IP/candidates, firewall ports and TURN service,
   including TURN/TLS for restrictive campus or corporate networks. The local
   Compose profile does **not** configure production TURN.
3. Generate a unique API key and a strong API secret of at least 32 bytes. Store
   them only in backend/server secrets, never in the Angular environment.
4. Configure Django's `LIVEKIT_URL` with the browser-reachable `wss://` URL.
   `LIVEKIT_API_URL` may point to a separate private, trusted server API endpoint.
   The join API fails explicitly with 503 when configuration/provisioning fails.
5. Apply the new database migrations and refresh the runtime role's grants.
   Deploy the backend before enabling the updated learner UI.
6. If adding a CSP, allow the media hostname in `connect-src` and required media
   sources. Do not disable camera, microphone or display capture in a reverse
   proxy's Permissions-Policy; allow same-origin capture for the learner app.
7. Test real Chrome devices on campus Wi-Fi, VPNs and mobile networks, including
   TURN fallback, denied permissions, reconnects and 21 concurrent participants.
   Monitor bandwidth, CPU, packet loss and connection quality before a cohort launch.

The media connection is transport-encrypted WebRTC, **not application-level
end-to-end encryption** against the SFU. Treat the media host as part of the
education-data boundary. There is no recording or caption service in this release.

Join credentials last five minutes and are scoped to one classroom and one opaque
membership ID. No emails or Firebase tokens are sent to LiveKit. Credentials do
not grant room administration or data publishing. Both server-side provisioning
and token room configuration preserve the capacity limit when an idle media room
is recreated. Membership/role changes are checked on each credential request.
Previously issued credentials remain usable until expiry, and connected clients
can reconnect using LiveKit-refreshed credentials. Changing membership does not
evict an already-connected participant; immediate revocation/moderation needs a
separate server-side participant-removal flow before use cases that require it.

## Verification

```bash
cd backend
uv run pytest tests/test_engage.py
cd ..
npx nx test learner --runInBand --testPathPatterns='engage/.*spec.ts'
npx nx build learner --configuration=production
```

For real media verification, install Google Chrome, start the local media profile,
then run:

```bash
LIVEKIT_SMOKE=1 npx playwright test \
  --config apps/learner-e2e/playwright.media.config.ts --reporter=line
```

The opt-in test AOT-compiles the actual classroom component and runs two Chrome
participants against the actual local LiveKit server, using Django's credential
signer. It checks private-by-default entry, roles, decoded video, received audio,
screen sharing and leave cleanup. HTTP classroom/authentication fixtures are
isolated from the normal app; backend tests separately exercise authenticated
tenant access, roles, provisioning failures, grants, expiry and Postgres RLS.
Fake camera/microphone and screen-picker flags are confined to this automated
test, not required by the app. It is not a full Firebase-to-media end-to-end test
or a 21-person load test.
