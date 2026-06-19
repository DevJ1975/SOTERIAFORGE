# ATL Airport Demo Seed

Populates the Firebase **emulators** with a complete, demo-ready slice for the
Hartsfield-Jackson Atlanta (ATL) airport tenant: a branded tenant, members,
four authored airport-safety courses (catalog metadata + rich `CourseDraft`
player content), badges, enrollments, leaderboards, and the platform-hosted
course videos uploaded to **Storage**.

Every Firestore document is validated through its `@forge/shared` zod schema
before it is written, and the seed is **idempotent** — fixed document ids plus
merge writes mean you can re-run it safely.

## Tenant

- **Tenant id:** `atl-airport`
- **Brand:** aviation navy `#0B3D91` / jet-bridge teal `#00A3A1` (white accent fg)

## Prerequisites

Start the Auth + Firestore + Storage emulators — the seed needs Storage to host
the course videos, and limiting the scope to these three avoids spinning up the
Functions emulator (which requires a built `dist` and can stall on a fresh
checkout):

```bash
firebase emulators:start --only auth,firestore,storage
```

Run order: start the emulators (above), then in a second terminal run the seed
(`npm run seed`), then sign in to an app as a demo learner.

By default the seed connects to:

| Emulator  | Env var                       | Default                 |
| --------- | ----------------------------- | ----------------------- |
| Firestore | `FIRESTORE_EMULATOR_HOST`     | `127.0.0.1:8080`        |
| Auth      | `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099`        |
| Storage   | `STORAGE_EMULATOR_HOST`       | `http://127.0.0.1:9199` |

The project id is read from `.firebaserc` (`soteria-forge-dev`). Videos upload
to the app-default bucket `soteria-forge-dev.appspot.com`.

## Run

```bash
npm run seed
```

This creates the demo Auth users (with `{ role, tenantId: 'atl-airport' }`
custom claims), writes all Firestore documents, and prints the credentials
table below.

## Demo credentials

All accounts share one password: **`AtlDemo!2026`**

| Role         | Email                         | Name                       |
| ------------ | ----------------------------- | -------------------------- |
| tenant_admin | `admin@atl-airport.demo`      | Dana Okafor (Tenant Admin) |
| instructor   | `instructor@atl-airport.demo` | Marcus Bell (Instructor)   |
| learner      | `jordan@atl-airport.demo`     | Jordan Pierce              |
| learner      | `sofia@atl-airport.demo`      | Sofia Ramirez              |
| learner      | `liang@atl-airport.demo`      | Liang Chen                 |
| learner      | `amara@atl-airport.demo`      | Amara Diallo               |
| learner      | `noah@atl-airport.demo`       | Noah Whitfield             |
| learner      | `priya@atl-airport.demo`      | Priya Nair                 |
| learner      | `diego@atl-airport.demo`      | Diego Santos               |
| learner      | `kayla@atl-airport.demo`      | Kayla Brooks               |

Then start an app (e.g. `npm run start:learner`) and sign in as a demo learner
such as `jordan@atl-airport.demo` to explore the seeded courses, progress, and
leaderboard.

## What gets seeded

- **Tenant** `tenants/atl-airport` with ATL branding colors and logo placeholder.
- **Members** `tenants/atl-airport/members/{uid}` — 1 tenant admin, 1 instructor,
  8 learners with varied `xp` / `level` / `streakDays`.
- **Courses** `tenants/atl-airport/courses/{courseId}`:

  - `atl-ramp-apron-safety` — Ramp & Apron Safety
  - `atl-jet-bridge-door-ops` — Jet Bridge & Aircraft Door Operations
  - `atl-deicing-winter-ops` — Aircraft De-Icing & Winter Ramp Ops
  - `atl-fueling-fire-safety` — Aviation Fueling Safety & Fire Prevention

  Each has a `Course` meta doc (status `published`) and a rich
  `CourseDraft` at `courses/{courseId}/content/draft` (its `id` equals the
  `courseId`) exercising every authoring block kind with real OSHA / FAA / NFPA
  references and knowledge checks.

- **Course videos** in **Storage** at
  `tenants/atl-airport/courses/{courseId}/videos/intro-clip.mp4`. Three courses
  (Ramp & Apron, Jet Bridge, De-Icing) carry an uploaded `video` block — their
  former external YouTube embeds are re-pointed to this platform-hosted sample
  (`tools/seed/assets/sample-ramp-safety.mp4`), so the learner can play and
  download them for offline use. The block's `storagePath`, emulator `url`,
  `mimeType`, and `sizeBytes` are set in the seeded `CourseDraft`.

- **Badges** `tenants/atl-airport/badges/{badgeId}` — FOD Spotter, Ramp Safety
  Certified, De-Ice Pro, Fuel Safety, 7-Day Streak.
- **Enrollments** `tenants/atl-airport/courses/{courseId}/enrollments/{uid}` — a
  mix of completed (with score) and in-progress (with `progressPct`).
- **Leaderboards** `tenants/atl-airport/leaderboard/{daily|weekly|allTime}` —
  ranked from member xp.
