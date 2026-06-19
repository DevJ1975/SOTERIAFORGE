# ATL Airport Demo — Build Contracts (authoritative)

This is the single source of truth for the "deep demo-ready slice" work targeting the
**Hartsfield-Jackson Atlanta International Airport (ATL)** demo round. Three build agents work
in parallel against these contracts. **Do not change a shared contract without updating this file.**

Tenant id for the whole demo: **`atl-airport`**. Brand: aviation navy/teal (see §5).

## Ownership map (do not edit files outside your lane)

- **Agent 1 — Learner vertical & data:** `libs/lms-core/**`, `libs/data-access/src/lib/collections.ts`
  (+ `src/index.ts`), `apps/learner/**`, `firestore.rules`, `libs/data-access/src/rules/**`.
- **Agent 2 — Gamification:** `libs/gamification/**` only.
- **Agent 3 — ATL content & seed:** `libs/games/src/lib/hazard-hunt/hazard-data.ts`,
  `libs/games/src/lib/peril/peril-data.ts`, `libs/games/src/index.ts`, `tools/seed/**`,
  `package.json` (add the `seed` script only).

No agent runs git. No agent edits another lane's files. Keep everything lint/type clean.

## 1. Firestore layout (ATL demo)

```
/tenants/atl-airport                                  Tenant   (branding colors + logoUrl)
/tenants/atl-airport/members/{uid}                    Member   (xp/level/streakDays seeded)
/tenants/atl-airport/courses/{courseId}               Course   (catalog metadata; status:'published')
/tenants/atl-airport/courses/{courseId}/content/draft CourseDraft (rich blocks for the player) ← NEW
/tenants/atl-airport/courses/{courseId}/enrollments/{uid}  Enrollment (progress/score; learner-writable)
/tenants/atl-airport/badges/{badgeId}                 Badge
/tenants/atl-airport/leaderboard/{daily|weekly|allTime}  Leaderboard
```

- `Course` (the `course` schema, `@forge/shared`) holds catalog metadata: `title`, `description`,
  `status`, `tags`, `xpReward`, `badgeRefs`. The player content is the **`CourseDraft`** (authoring
  schema, `@forge/shared`) stored at `courses/{courseId}/content/draft`.
- **Invariant:** the content doc's `CourseDraft.id` MUST equal its parent `courseId`.

## 2. New data-access surface (Agent 1 adds to `collections.ts`)

```ts
import { courseDraft, type CourseDraft } from '@forge/shared';
const courseContentConverter = zodConverter(courseDraft);

/** /tenants/{tenantId}/courses/{courseId}/content — rich authoring content for the player. */
export function courseContentCol(db, tenantId, courseId): CollectionReference<CourseDraft>;
/** /tenants/{tenantId}/courses/{courseId}/content/draft */
export function courseContentDoc(db, tenantId, courseId): DocumentReference<CourseDraft>;
```

Export both from `libs/data-access/src/index.ts` (already re-exports `./lib/collections`).

## 3. firestore.rules (Agent 1) — add under `match /courses/{courseId}`

```
// Rich player content: tenant members read; writes are Cloud-Functions/seed only.
match /content/{contentId} {
  allow read: if isSuperadmin() || inTenant(tenantId);
  allow write: if false;
}
```

Add a rules unit test (in `libs/data-access/src/rules/firestore.rules.spec.ts`) proving a tenant
member can read `content/draft` and a cross-tenant user is denied.

## 4. lms-core service contracts (Agent 1 implements; learner UI consumes)

Angular `@Injectable({ providedIn: 'root' })` services. Inject the Firestore instance via the
existing data-access Firestore token (see `libs/data-access/src/lib/firestore.token.ts`) and use the
`collections.ts` helpers. All methods async.

```ts
class CourseCatalogService {
  listPublished(tenantId: string): Promise<Course[]>; // status === 'published'
  get(tenantId: string, courseId: string): Promise<Course | undefined>;
}
class CourseContentService {
  getContent(tenantId: string, courseId: string): Promise<CourseDraft | undefined>;
}
class EnrollmentService {
  enroll(tenantId, courseId, uid, email): Promise<Enrollment>; // idempotent upsert
  getEnrollment(tenantId, courseId, uid): Promise<Enrollment | undefined>;
  listMyEnrollments(tenantId, uid): Promise<{ course: Course; enrollment: Enrollment }[]>;
}
class ProgressService {
  // Writes the learner's OWN enrollment doc (allowed by rules). Computes progressPct.
  setLessonProgress(
    tenantId,
    courseId,
    uid,
    completedLessonIds: string[],
    totalLessons: number,
  ): Promise<Enrollment>;
  completeCourse(tenantId, courseId, uid, score?: number): Promise<Enrollment>; // completed=true, pct=100
}
```

**XP/badges note:** member docs are Cloud-Functions-only (rules: `write:if false`). For this demo,
member `xp/level/streakDays`, badges, and leaderboard are **seeded** (Agent 3). On course completion
the learner UI shows a celebratory projection using the gamification engine's pure math (`@forge/
gamification`) but does NOT write the member doc. Live XP writes are a Phase-4 Cloud Function (out of
demo scope) — keep this honest in any UI copy/tooltips.

## 5. gamification API (Agent 2 implements; Agent 1 consumes via `@forge/gamification`)

Pure functions (framework-free):

```ts
function levelForXp(xp: number): number; // monotonic; document the curve
function xpForLevel(level: number): number; // inverse threshold
function levelProgress(xp: number): { level: number; intoLevel: number; span: number; pct: number };
function courseCompletionXp(course: { xpReward?: number }): number;
```

Standalone Angular components (selectors prefixed `forge-`):

- `XpBar` — `@Input() xp` → level chip + progress bar (uses `levelProgress`).
- `BadgeWall` — `@Input() badges: Badge[]; @Input() earnedIds: string[]` → earned vs locked grid.
- `LeaderboardTable` — `@Input() entries: Leaderboard['entries']; @Input() currentUid?` → ranked rows, highlight current user.
- `StreakChip` — `@Input() streakDays`.

Use only `@forge/shared` types + `@forge/ui` tokens (never hardcode hex). Export everything from
`libs/gamification/src/index.ts`. Replace the placeholder component/tests.

## 6. ATL brand (Agent 3 sets on the tenant doc; Agent 1 applies at runtime)

`tenant.branding.colors` is a record of `--forge-*` CSS custom properties → values. ATL palette:

```
--forge-accent:      #0B3D91   (aviation navy)
--forge-accent-2:    #00A3A1   (jet-bridge teal)
--forge-accent-fg:   #FFFFFF
```

`tenant.branding.logoUrl` may be a placeholder. **Agent 1** applies branding on learner bootstrap by
calling the existing `ForgeTheming.applyBranding()` (in `@forge/auth`) once the principal's tenant
doc is loaded.

## 7. Games content selection (Agent 3 content; Agent 1 links)

- Hazard Hunter: Agent 3 adds **Level 3 — "ATL RAMP"** to `LEVELS` in `hazard-data.ts` using existing
  `HazardKind` archetypes, with airport-contextual `incident` + real `oshaRef`/`oshaTitle`.
- PERIL!: Agent 3 adds an **aviation-safety board** (6 R1 + 6 R2 categories + Final PERIL) and exposes
  it via the games barrel; the `PerilComponent` selects the board from a `?board=airport` route query
  param (default = existing OSHA board). Agent 1 adds the learner links/routes that pass the param.

## 8. Seed script (Agent 3) — `tools/seed/seed-emulator.ts`, `npm run seed`

- Use `firebase-admin` (already a workspace dep via `apps/functions`). Connect to the **Firestore
  emulator** (`FIRESTORE_EMULATOR_HOST`, default `127.0.0.1:8080`) and **Auth emulator**
  (`FIREBASE_AUTH_EMULATOR_HOST`, default `127.0.0.1:9099`); project id from `.firebaserc`.
- Create demo Auth users (admin, instructor, ~8 learners) with custom claims
  `{ role, tenantId: 'atl-airport' }` via `setCustomUserClaims`. Print a credentials table.
- Write every Firestore doc **validated through its `@forge/shared` zod schema** (parse, then set via
  the literal paths in §1 — admin SDK bypasses rules). Set audit `createdAt` ISO strings.
- Seed: tenant (+branding §6), members (varied xp/level/streak), 3–4 airport courses (Course meta +
  `content/draft` CourseDraft authored with the 15 block kinds, real OSHA/FAA refs, knowledge checks),
  badges, enrollments (mix of completed / in-progress), and leaderboard (daily/weekly/allTime derived
  from member xp). Make it idempotent (fixed ids; merge writes).
- Write `tools/seed/README.md`: `firebase emulators:start` → `npm run seed` → log in as a demo learner.

## Conventions (all agents)

Zod schemas in `@forge/shared`; all Firestore I/O via data-access converters/helpers (no raw
`setDoc` in apps). Deny-by-default rules; tests ship with new collections. Design tokens only — never
hardcode colors. Prettier: single quotes, width 100, trailing commas. Respect nx module boundaries
(`type:app`→feature/data-access/ui/util; `type:feature`→feature/data-access/ui/util;
`type:data-access`→data-access/util; `type:ui`→ui/util; `type:util`→util).
