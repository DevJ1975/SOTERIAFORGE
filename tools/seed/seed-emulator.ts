/**
 * Soteria FORGE — ATL airport demo emulator seed.
 *
 * Populates the Auth + Firestore + Storage emulators with a complete,
 * demo-ready slice for the Hartsfield-Jackson Atlanta (ATL) airport tenant:
 * branded tenant, members, four authored airport-safety courses (Course meta +
 * CourseDraft content), badges, enrollments, leaderboards, and the
 * platform-hosted course videos uploaded to Storage.
 *
 * Every Firestore document is validated through its `@forge/shared` zod schema
 * before it is written (schema.parse(obj) -> set(parsed, { merge: true })), and
 * the script is idempotent: fixed document ids + merge writes mean re-running
 * it overwrites the same docs rather than creating duplicates.
 *
 * Prerequisites: the Auth, Firestore, and Storage emulators must be running
 * (`firebase emulators:start --only auth,firestore,storage`). See
 * tools/seed/README.md.
 *
 *   FIRESTORE_EMULATOR_HOST     default 127.0.0.1:8080
 *   FIREBASE_AUTH_EMULATOR_HOST default 127.0.0.1:9099
 *   STORAGE_EMULATOR_HOST       default http://127.0.0.1:9199
 *
 * Run with: `npm run seed`
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  badge as badgeSchema,
  course as courseSchema,
  courseDraft as courseDraftSchema,
  enrollment as enrollmentSchema,
  leaderboard as leaderboardSchema,
  liveSession as liveSessionSchema,
  member as memberSchema,
  tenant as tenantSchema,
  type Badge,
  type Course,
  type Enrollment,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LiveSession,
  type Member,
  type Role,
  type Tenant,
} from '@forge/shared';
import {
  RAMP_APRON_COURSE_ID,
  SAMPLE_VIDEO_FILE,
  SAMPLE_VIDEO_MIME,
  SEED_COURSES,
  SEED_STORAGE_BUCKET,
} from './content';
import type { VideoBlock } from '@forge/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'atl-airport';
const DEMO_PASSWORD = 'AtlDemo!2026';
const NOW = '2026-06-19T12:00:00.000Z';
const DEFAULT_FIRESTORE_EMULATOR = '127.0.0.1:8080';
const DEFAULT_AUTH_EMULATOR = '127.0.0.1:9099';
const DEFAULT_STORAGE_EMULATOR = 'http://127.0.0.1:9199';

/** Resolve the project id from .firebaserc (default project). */
function resolveProjectId(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const firebaserc = resolve(here, '..', '..', '.firebaserc');
  const parsed = JSON.parse(readFileSync(firebaserc, 'utf8')) as {
    projects?: { default?: string };
  };
  const projectId = parsed.projects?.default;
  if (!projectId) {
    throw new Error('Could not resolve default project id from .firebaserc');
  }
  return projectId;
}

// ---------------------------------------------------------------------------
// Demo people
// ---------------------------------------------------------------------------

interface SeedPerson {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  xp: number;
  level: number;
  streakDays: number;
}

/**
 * Documented leveling curve (kept in sync with @forge/gamification): each
 * level costs an extra 100 XP more than the last, so the threshold for level L
 * is 100 * (L-1) * L / 2. We seed xp/level pairs that satisfy it.
 */
function levelForXp(xp: number): number {
  let level = 1;
  while (100 * (level * (level + 1)) * 0.5 <= xp) level += 1;
  return level;
}

const PEOPLE: SeedPerson[] = [
  {
    uid: 'atl-admin',
    email: 'admin@atl-airport.demo',
    displayName: 'Dana Okafor (Tenant Admin)',
    role: 'tenant_admin',
    xp: 0,
    level: 1,
    streakDays: 0,
  },
  {
    uid: 'atl-instructor',
    email: 'instructor@atl-airport.demo',
    displayName: 'Marcus Bell (Instructor)',
    role: 'instructor',
    xp: 0,
    level: 1,
    streakDays: 0,
  },
  {
    uid: 'atl-learner-1',
    email: 'jordan@atl-airport.demo',
    displayName: 'Jordan Pierce',
    role: 'learner',
    xp: 2400,
    level: levelForXp(2400),
    streakDays: 12,
  },
  {
    uid: 'atl-learner-2',
    email: 'sofia@atl-airport.demo',
    displayName: 'Sofia Ramirez',
    role: 'learner',
    xp: 1850,
    level: levelForXp(1850),
    streakDays: 7,
  },
  {
    uid: 'atl-learner-3',
    email: 'liang@atl-airport.demo',
    displayName: 'Liang Chen',
    role: 'learner',
    xp: 1500,
    level: levelForXp(1500),
    streakDays: 5,
  },
  {
    uid: 'atl-learner-4',
    email: 'amara@atl-airport.demo',
    displayName: 'Amara Diallo',
    role: 'learner',
    xp: 950,
    level: levelForXp(950),
    streakDays: 3,
  },
  {
    uid: 'atl-learner-5',
    email: 'noah@atl-airport.demo',
    displayName: 'Noah Whitfield',
    role: 'learner',
    xp: 600,
    level: levelForXp(600),
    streakDays: 2,
  },
  {
    uid: 'atl-learner-6',
    email: 'priya@atl-airport.demo',
    displayName: 'Priya Nair',
    role: 'learner',
    xp: 300,
    level: levelForXp(300),
    streakDays: 1,
  },
  {
    uid: 'atl-learner-7',
    email: 'diego@atl-airport.demo',
    displayName: 'Diego Santos',
    role: 'learner',
    xp: 120,
    level: levelForXp(120),
    streakDays: 1,
  },
  {
    uid: 'atl-learner-8',
    email: 'kayla@atl-airport.demo',
    displayName: 'Kayla Brooks',
    role: 'learner',
    xp: 0,
    level: 1,
    streakDays: 0,
  },
];

const LEARNERS = PEOPLE.filter((p) => p.role === 'learner');

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

interface SeedBadge {
  id: string;
  name: string;
  description: string;
  criteria: string;
}

const BADGES: SeedBadge[] = [
  {
    id: 'fod-spotter',
    name: 'FOD Spotter',
    description: 'Awarded for mastering foreign object debris control on the ramp.',
    criteria: 'Complete the Ramp & Apron Safety course with a passing score.',
  },
  {
    id: 'ramp-safety-certified',
    name: 'Ramp Safety Certified',
    description: 'Demonstrated competence across core ramp and apron safety operations.',
    criteria: 'Complete Ramp & Apron Safety and Jet Bridge & Aircraft Door Operations.',
  },
  {
    id: 'de-ice-pro',
    name: 'De-Ice Pro',
    description: 'Certified in aircraft de-icing and winter ramp operations.',
    criteria: 'Complete the Aircraft De-Icing & Winter Ramp Ops course.',
  },
  {
    id: 'fuel-safety',
    name: 'Fuel Safety',
    description: 'Certified in aviation fueling safety and fire prevention.',
    criteria: 'Complete the Aviation Fueling Safety & Fire Prevention course.',
  },
  {
    id: '7-day-streak',
    name: '7-Day Streak',
    description: 'Trained on the ramp safety platform seven days in a row.',
    criteria: 'Maintain a learning streak of at least seven consecutive days.',
  },
];

// ---------------------------------------------------------------------------
// Live sessions (Zoom) — one upcoming, one live now, one ended with a recording
// ---------------------------------------------------------------------------

/** The seeded instructor hosts every demo live session. */
const INSTRUCTOR_UID = 'atl-instructor';

interface SeedLiveSession {
  id: string;
  title: string;
  description: string;
  type: 'meeting' | 'webinar';
  status: 'scheduled' | 'live' | 'ended' | 'canceled';
  /** ISO-8601 with offset, relative to NOW (2026-06-19T12:00Z). */
  scheduledStart: string;
  durationMin: number;
  courseId?: string;
  meetingId?: string;
  joinUrl?: string;
  passcode?: string;
  recordingUrl?: string;
  recordingId?: string;
}

/**
 * Mock Zoom artifacts. With no `ZOOM_*` creds the real callables short-circuit
 * to the fake adapter; these mirror the deterministic shapes it would produce
 * so the learner UI has live/upcoming/past sessions to render out of the box.
 */
const SEED_LIVE_SESSIONS: SeedLiveSession[] = [
  {
    id: 'atl-ramp-safety-qa',
    title: 'Ramp Safety Live Q&A',
    description:
      'Bring your toughest ramp and apron safety questions for a live Q&A with the ATL safety team. Linked to the Ramp & Apron Safety course.',
    type: 'meeting',
    status: 'scheduled',
    // 3 days after NOW.
    scheduledStart: '2026-06-22T15:00:00.000Z',
    durationMin: 45,
    courseId: RAMP_APRON_COURSE_ID,
    meetingId: '910000111',
    joinUrl: 'https://zoom.us/j/910000111?pwd=ramp-safety-qa-demo',
    passcode: '482913',
  },
  {
    id: 'atl-winter-deicing-briefing',
    title: 'Winter De-Icing Briefing',
    description:
      'Live operational briefing on aircraft de-icing and winter ramp procedures. Join now from any device.',
    type: 'webinar',
    status: 'live',
    // Started 15 minutes before NOW (in progress).
    scheduledStart: '2026-06-19T11:45:00.000Z',
    durationMin: 60,
    meetingId: '920000222',
    joinUrl: 'https://zoom.us/j/920000222?pwd=winter-deicing-demo',
    passcode: '771204',
  },
  {
    id: 'atl-fod-awareness-webinar',
    title: 'FOD Awareness Webinar',
    description:
      'A recorded webinar on foreign object debris (FOD) prevention across the airfield. Watch the recording any time.',
    type: 'webinar',
    status: 'ended',
    // 5 days before NOW.
    scheduledStart: '2026-06-14T16:00:00.000Z',
    durationMin: 50,
    meetingId: '930000333',
    recordingUrl: 'https://zoom.us/rec/share/atl-fod-awareness-webinar-demo',
    recordingId: 'rec-930000333',
  },
];

function buildLiveSession(s: SeedLiveSession): LiveSession {
  // Omit undefined optional keys: firebase-admin throws on `undefined` values
  // and zod keeps explicit `undefined` optional keys.
  return liveSessionSchema.parse({
    id: s.id,
    tenantId: TENANT_ID,
    title: s.title,
    description: s.description,
    type: s.type,
    status: s.status,
    scheduledStart: s.scheduledStart,
    durationMin: s.durationMin,
    hostUid: INSTRUCTOR_UID,
    ...(s.courseId !== undefined ? { courseId: s.courseId } : {}),
    ...(s.meetingId !== undefined ? { meetingId: s.meetingId } : {}),
    ...(s.joinUrl !== undefined ? { joinUrl: s.joinUrl } : {}),
    ...(s.passcode !== undefined ? { passcode: s.passcode } : {}),
    ...(s.recordingUrl !== undefined ? { recordingUrl: s.recordingUrl } : {}),
    ...(s.recordingId !== undefined ? { recordingId: s.recordingId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies LiveSession);
}

// ---------------------------------------------------------------------------
// Enrollments (mix of completed and in-progress)
// ---------------------------------------------------------------------------

interface SeedEnrollment {
  uid: string;
  courseId: string;
  progressPct: number;
  completed: boolean;
  score?: number;
  lastActivityAt: string;
}

/** Builds a deterministic spread of completed / in-progress enrollments. */
function buildEnrollments(): SeedEnrollment[] {
  const courseIds = SEED_COURSES.map((c) => c.draft.id);
  const rows: SeedEnrollment[] = [];
  // A fixed, hand-tuned matrix so the demo always looks the same.
  const matrix: Record<string, Array<{ pct: number; score?: number }>> = {
    'atl-learner-1': [
      { pct: 100, score: 96 },
      { pct: 100, score: 91 },
      { pct: 100, score: 88 },
      { pct: 60 },
    ],
    'atl-learner-2': [{ pct: 100, score: 89 }, { pct: 100, score: 84 }, { pct: 45 }, { pct: 20 }],
    'atl-learner-3': [{ pct: 100, score: 92 }, { pct: 70 }, { pct: 100, score: 80 }, { pct: 0 }],
    'atl-learner-4': [{ pct: 100, score: 78 }, { pct: 30 }, { pct: 0 }, { pct: 0 }],
    'atl-learner-5': [{ pct: 80 }, { pct: 0 }, { pct: 0 }, { pct: 0 }],
    'atl-learner-6': [{ pct: 40 }, { pct: 0 }, { pct: 0 }, { pct: 0 }],
    'atl-learner-7': [{ pct: 15 }, { pct: 0 }, { pct: 0 }, { pct: 0 }],
    'atl-learner-8': [{ pct: 0 }, { pct: 0 }, { pct: 0 }, { pct: 0 }],
  };
  for (const learner of LEARNERS) {
    const plan = matrix[learner.uid] ?? [];
    plan.forEach((entry, i) => {
      if (entry.pct === 0) return; // not yet enrolled in this one
      rows.push({
        uid: learner.uid,
        courseId: courseIds[i],
        progressPct: entry.pct,
        completed: entry.pct === 100,
        score: entry.score,
        lastActivityAt: NOW,
      });
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Document builders (each validated against its schema before write)
// ---------------------------------------------------------------------------

function buildTenant(): Tenant {
  return tenantSchema.parse({
    id: TENANT_ID,
    name: 'Hartsfield-Jackson Atlanta International Airport',
    status: 'active',
    plan: 'enterprise',
    branding: {
      logoUrl: 'https://storage.googleapis.com/soteria-forge-dev-assets/atl-airport/logo.png',
      colors: {
        '--forge-accent': '#0B3D91',
        '--forge-accent-2': '#00A3A1',
        '--forge-accent-fg': '#FFFFFF',
      },
      emailFromName: 'ATL Ramp Safety Academy',
    },
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies Tenant);
}

function buildMember(person: SeedPerson): Member {
  return memberSchema.parse({
    uid: person.uid,
    tenantId: TENANT_ID,
    role: person.role,
    status: 'active',
    email: person.email,
    displayName: person.displayName,
    xp: person.xp,
    level: person.level,
    streakDays: person.streakDays,
    lastActiveAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies Member);
}

function buildBadge(b: SeedBadge): Badge {
  return badgeSchema.parse({
    id: b.id,
    tenantId: TENANT_ID,
    name: b.name,
    description: b.description,
    criteria: b.criteria,
    issuerId: TENANT_ID,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies Badge);
}

function buildCourseMeta(courseId: string): Course {
  const seed = SEED_COURSES.find((c) => c.draft.id === courseId);
  if (!seed) throw new Error(`No seed course for ${courseId}`);
  return courseSchema.parse({
    id: courseId,
    tenantId: TENANT_ID,
    title: seed.draft.title,
    description: seed.draft.description,
    status: 'published',
    tags: seed.meta.tags,
    badgeRefs: seed.meta.badgeRefs,
    xpReward: seed.meta.xpReward,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies Course);
}

function buildEnrollment(row: SeedEnrollment): Enrollment {
  // Omit `score` entirely when undefined: zod keeps explicit `undefined`
  // optional keys, and firebase-admin throws on `undefined` Firestore values.
  return enrollmentSchema.parse({
    uid: row.uid,
    courseId: row.courseId,
    tenantId: TENANT_ID,
    progressPct: row.progressPct,
    completed: row.completed,
    progressVersion: 0,
    completedLessonIds: [],
    attemptCount: row.completed ? 1 : 0,
    ...(row.score !== undefined ? { score: row.score } : {}),
    lastActivityAt: row.lastActivityAt,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies Enrollment);
}

function buildLeaderboard(period: LeaderboardPeriod): Leaderboard {
  const ranked = [...LEARNERS]
    .sort((a, b) => b.xp - a.xp)
    .map(
      (p, i): LeaderboardEntry => ({
        uid: p.uid,
        displayName: p.displayName,
        xp: p.xp,
        rank: i + 1,
      }),
    );
  return leaderboardSchema.parse({
    tenantId: TENANT_ID,
    period,
    entries: ranked,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies Leaderboard);
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

async function seedAuth(app: App): Promise<void> {
  const auth = getAuth(app);
  for (const person of PEOPLE) {
    try {
      await auth.createUser({
        uid: person.uid,
        email: person.email,
        emailVerified: true,
        password: DEMO_PASSWORD,
        displayName: person.displayName,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/uid-already-exists' || code === 'auth/email-already-exists') {
        await auth.updateUser(person.uid, {
          email: person.email,
          password: DEMO_PASSWORD,
          displayName: person.displayName,
        });
      } else {
        throw err;
      }
    }
    await auth.setCustomUserClaims(person.uid, {
      role: person.role,
      tenantId: TENANT_ID,
    });
  }
}

async function seedFirestore(db: Firestore): Promise<void> {
  // Tenant.
  await db.doc(`tenants/${TENANT_ID}`).set(buildTenant(), { merge: true });

  // Members.
  for (const person of PEOPLE) {
    await db
      .doc(`tenants/${TENANT_ID}/members/${person.uid}`)
      .set(buildMember(person), { merge: true });
  }

  // Badges.
  for (const b of BADGES) {
    await db.doc(`tenants/${TENANT_ID}/badges/${b.id}`).set(buildBadge(b), { merge: true });
  }

  // Courses: meta doc + content/draft. Invariant: draft.id === courseId.
  for (const seed of SEED_COURSES) {
    const courseId = seed.draft.id;
    const draft = courseDraftSchema.parse(seed.draft);
    if (draft.id !== courseId) {
      throw new Error(`CourseDraft.id (${draft.id}) must equal courseId (${courseId})`);
    }
    await db
      .doc(`tenants/${TENANT_ID}/courses/${courseId}`)
      .set(buildCourseMeta(courseId), { merge: true });
    await db
      .doc(`tenants/${TENANT_ID}/courses/${courseId}/content/draft`)
      .set(draft, { merge: true });
  }

  // Enrollments.
  for (const row of buildEnrollments()) {
    await db
      .doc(`tenants/${TENANT_ID}/courses/${row.courseId}/enrollments/${row.uid}`)
      .set(buildEnrollment(row), { merge: true });
  }

  // Leaderboards (derived from member xp).
  const periods: LeaderboardPeriod[] = ['daily', 'weekly', 'allTime'];
  for (const period of periods) {
    await db
      .doc(`tenants/${TENANT_ID}/leaderboard/${period}`)
      .set(buildLeaderboard(period), { merge: true });
  }

  // Live sessions (Zoom) — learner-readable docs only. The sensitive host
  // `startUrl` lives in a private subdoc written by Cloud Functions, not here.
  for (const session of SEED_LIVE_SESSIONS) {
    await db
      .doc(`tenants/${TENANT_ID}/liveSessions/${session.id}`)
      .set(buildLiveSession(session), { merge: true });
  }
}

/**
 * Upload the sample clip to Storage for every ATL course whose draft has an
 * uploaded `video` block (one carrying a `storagePath`). The content blocks
 * already point at these exact object paths + emulator download URLs, so the
 * bytes simply have to exist; we upload to the same path with `video/mp4` and
 * make it idempotent by overwriting any prior object at that path.
 */
async function seedStorage(app: App): Promise<number> {
  const bucket = getStorage(app).bucket();
  const here = dirname(fileURLToPath(import.meta.url));
  const samplePath = resolve(here, SAMPLE_VIDEO_FILE);
  const bytes = readFileSync(samplePath);

  let uploaded = 0;
  for (const seed of SEED_COURSES) {
    const videoBlocks = seed.draft.lessons
      .flatMap((lesson) => lesson.blocks)
      .filter((block): block is VideoBlock => block.kind === 'video' && !!block.storagePath);
    for (const block of videoBlocks) {
      const storagePath = block.storagePath as string;
      const file = bucket.file(storagePath);
      // Overwrite/merge: re-running replaces the object at the fixed path.
      await file.save(bytes, {
        contentType: SAMPLE_VIDEO_MIME,
        resumable: false,
        metadata: { contentType: SAMPLE_VIDEO_MIME },
      });
      uploaded += 1;
    }
  }
  return uploaded;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printCredentials(): void {
  const pad = (s: string, n: number) => s.padEnd(n);
  const lines: string[] = [];
  lines.push('');
  lines.push('  ATL airport demo seeded. Tenant id: ' + TENANT_ID);
  lines.push('  Shared demo password for every account: ' + DEMO_PASSWORD);
  lines.push('');
  lines.push('  ' + pad('ROLE', 14) + pad('EMAIL', 32) + 'NAME');
  lines.push('  ' + '-'.repeat(70));
  for (const p of PEOPLE) {
    lines.push('  ' + pad(p.role, 14) + pad(p.email, 32) + p.displayName);
  }
  lines.push('');
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    process.env['FIRESTORE_EMULATOR_HOST'] = DEFAULT_FIRESTORE_EMULATOR;
  }
  if (!process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = DEFAULT_AUTH_EMULATOR;
  }
  // firebase-admin Storage talks to the emulator when STORAGE_EMULATOR_HOST is
  // set (full URL with scheme, unlike the Firestore/Auth host:port form).
  if (!process.env['STORAGE_EMULATOR_HOST']) {
    process.env['STORAGE_EMULATOR_HOST'] = DEFAULT_STORAGE_EMULATOR;
  }

  const projectId = resolveProjectId();
  // eslint-disable-next-line no-console
  console.log(
    `Seeding project "${projectId}" — Firestore @ ${process.env['FIRESTORE_EMULATOR_HOST']}, ` +
      `Auth @ ${process.env['FIREBASE_AUTH_EMULATOR_HOST']}, ` +
      `Storage @ ${process.env['STORAGE_EMULATOR_HOST']}`,
  );

  // Default bucket is the project's app-default bucket; the apps resolve the
  // same bucket from their (unconfigured) Firebase options. See video-asset.ts.
  const app = initializeApp({ projectId, storageBucket: SEED_STORAGE_BUCKET });
  const db = getFirestore(app);
  // Belt-and-suspenders against `undefined` Firestore values (e.g. an
  // in-progress enrollment with no `score`): drop undefined keys on write.
  db.settings({ ignoreUndefinedProperties: true });

  await seedAuth(app);
  await seedFirestore(db);
  const uploadedVideos = await seedStorage(app);

  printCredentials();
  // eslint-disable-next-line no-console
  console.log(
    `Uploaded ${uploadedVideos} course video${uploadedVideos === 1 ? '' : 's'} to Storage ` +
      `(bucket ${SEED_STORAGE_BUCKET}).`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${SEED_LIVE_SESSIONS.length} live sessions ` +
      `(${SEED_LIVE_SESSIONS.map((s) => s.status).join(', ')}).`,
  );
  // eslint-disable-next-line no-console
  console.log('Done. Start the apps and sign in as any demo account above.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
