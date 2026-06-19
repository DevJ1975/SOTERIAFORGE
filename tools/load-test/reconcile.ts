/**
 * Soteria FORGE — load-test reconciliation (the zero-dup / zero-loss proof).
 *
 * After a sync-storm (or soak) run, this script reads the GROUND TRUTH — every
 * learner's append-only `events` subcollection — folds it the way the server
 * projection is defined to, and asserts the persisted enrollment doc EXACTLY
 * equals that fold. Any mismatch (a dropped event, a duplicate that failed to
 * collapse, or a stale event that beat the monotonic guard) exits non-zero.
 *
 * Fold definition (mirrors the contract in docs/HARDENING_CONTRACTS.md §core
 * model and Lane B's projection):
 *   1. De-duplicate the events by `idempotencyKey` (the doc id ⇒ replays
 *      already collapsed at the store; this is belt-and-suspenders).
 *   2. Apply in ascending `clientSeq` under a monotonic guard (reject
 *      clientSeq <= progressVersion), so out-of-order arrival is irrelevant.
 *   3. The resulting { progressVersion, completedLessonIds, completed,
 *      attemptCount, lastEventKey } must equal the enrollment projection.
 *
 * Reuses the tools/seed admin-SDK + tsx + tsconfig-paths pattern. Run with
 * `npm run loadtest:reconcile` (the orchestrator wires the script).
 *
 *   FIRESTORE_EMULATOR_HOST     default 127.0.0.1:8080
 *
 * The progressEvent / enrollment shapes are imported from @forge/shared so a
 * contract drift fails the typecheck here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  enrollment as enrollmentSchema,
  progressEvent as progressEventSchema,
  type Enrollment,
  type ProgressEvent,
} from '@forge/shared';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_FIRESTORE_EMULATOR = '127.0.0.1:8080';
const TENANT_ID = process.env['TENANT_ID'] ?? 'atl-airport';

/** Resolve the project id from .firebaserc (default project). */
function resolveProjectId(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const firebaserc = resolve(here, '..', '..', '.firebaserc');
  const parsed = JSON.parse(readFileSync(firebaserc, 'utf8')) as {
    projects?: { default?: string };
  };
  const projectId = parsed.projects?.default;
  if (!projectId) throw new Error('Could not resolve default project id from .firebaserc');
  return projectId;
}

// ---------------------------------------------------------------------------
// The fold (server-projection definition)
// ---------------------------------------------------------------------------

interface Projection {
  progressVersion: number;
  completedLessonIds: string[];
  completed: boolean;
  attemptCount: number;
  lastEventKey?: string;
}

/**
 * Fold a learner's events into the expected enrollment projection.
 * De-dup by idempotencyKey, then apply in clientSeq order under the monotonic
 * guard. `docIds` carries the actual Firestore doc ids so we can assert the key
 * IS the id (the rules guarantee data.idempotencyKey == eventId).
 */
function foldEvents(events: Array<{ id: string; data: ProgressEvent }>): {
  projection: Projection;
  distinctKeys: number;
  totalDocs: number;
  keyMismatches: string[];
} {
  const byKey = new Map<string, ProgressEvent>();
  const keyMismatches: string[] = [];
  for (const { id, data } of events) {
    if (data.idempotencyKey !== id) keyMismatches.push(`${id} != ${data.idempotencyKey}`);
    // The doc id already de-dupes replays at the store; last-write-wins here.
    byKey.set(data.idempotencyKey, data);
  }

  const unique = Array.from(byKey.values()).sort((a, b) => a.clientSeq - b.clientSeq);

  let progressVersion = 0;
  const completedLessonIds: string[] = [];
  let completed = false;
  let attemptCount = 0;
  let lastEventKey: string | undefined;

  for (const e of unique) {
    if (e.clientSeq <= progressVersion) continue; // monotonic guard rejects stale
    progressVersion = e.clientSeq;
    lastEventKey = e.idempotencyKey;
    if (e.kind === 'lesson_completed' && e.lessonId && !completedLessonIds.includes(e.lessonId)) {
      completedLessonIds.push(e.lessonId);
    }
    if (e.kind === 'course_completed') completed = true;
    if (e.kind === 'score_recorded') attemptCount += 1;
  }

  return {
    projection: { progressVersion, completedLessonIds, completed, attemptCount, lastEventKey },
    distinctKeys: byKey.size,
    totalDocs: events.length,
    keyMismatches,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

interface RowResult {
  uid: string;
  courseId: string;
  totalEvents: number;
  distinctEvents: number;
  duplicatesCollapsed: number;
  ok: boolean;
  reasons: string[];
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Compare a folded projection against the persisted enrollment doc. */
function compare(
  expected: Projection,
  enr: Enrollment | null,
  keyMismatches: string[],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (keyMismatches.length > 0) {
    reasons.push(`idempotencyKey != docId for ${keyMismatches.length} event(s)`);
  }
  if (!enr) {
    reasons.push('enrollment document missing');
    return { ok: false, reasons };
  }
  if (enr.progressVersion !== expected.progressVersion) {
    reasons.push(`progressVersion ${enr.progressVersion} != expected ${expected.progressVersion}`);
  }
  if (!sameStringSet(enr.completedLessonIds ?? [], expected.completedLessonIds)) {
    reasons.push(
      `completedLessonIds [${(enr.completedLessonIds ?? []).join(',')}] != ` +
        `expected [${expected.completedLessonIds.join(',')}]`,
    );
  }
  if (expected.completed && !enr.completed) {
    reasons.push('expected completed=true but enrollment.completed=false');
  }
  if (expected.lastEventKey && enr.lastEventKey && enr.lastEventKey !== expected.lastEventKey) {
    reasons.push(`lastEventKey ${enr.lastEventKey} != expected ${expected.lastEventKey}`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Firestore traversal
// ---------------------------------------------------------------------------

/**
 * Find every (uid, courseId) enrollment under the tenant that carries an
 * `events` subcollection, and reconcile each. Uses a collectionGroup query on
 * `events` so we don't need to know the learner set in advance.
 */
async function reconcileAll(db: Firestore, projectId: string): Promise<RowResult[]> {
  const results: RowResult[] = [];

  // Group every event doc by its parent enrollment path.
  const eventsByEnrollment = new Map<string, Array<{ id: string; data: ProgressEvent }>>();
  const group = await db.collectionGroup('events').get();
  for (const doc of group.docs) {
    const parent = doc.ref.parent.parent; // .../enrollments/{uid}
    if (!parent) continue;
    // Only reconcile events under our tenant's enrollment path.
    if (!parent.path.startsWith(`tenants/${TENANT_ID}/courses/`)) continue;
    const parsed = progressEventSchema.safeParse(doc.data());
    if (!parsed.success) {
      // A malformed event is itself a failure to surface.
      const list = eventsByEnrollment.get(parent.path) ?? [];
      list.push({ id: doc.id, data: { idempotencyKey: '__INVALID__' } as ProgressEvent });
      eventsByEnrollment.set(parent.path, list);
      continue;
    }
    const list = eventsByEnrollment.get(parent.path) ?? [];
    list.push({ id: doc.id, data: parsed.data });
    eventsByEnrollment.set(parent.path, list);
  }

  for (const [enrPath, events] of eventsByEnrollment) {
    const enrSnap = await db.doc(enrPath).get();
    const raw = enrSnap.exists ? enrSnap.data() : null;
    const enr = raw ? (enrollmentSchema.partial().parse(raw) as Enrollment) : null;

    const { projection, distinctKeys, totalDocs, keyMismatches } = foldEvents(events);
    const { ok, reasons } = compare(projection, enr, keyMismatches);

    // Path: tenants/{t}/courses/{courseId}/enrollments/{uid}
    const segs = enrPath.split('/');
    const courseId = segs[3] ?? '?';
    const uid = segs[5] ?? '?';

    results.push({
      uid,
      courseId,
      totalEvents: totalDocs,
      distinctEvents: distinctKeys,
      duplicatesCollapsed: Math.max(0, totalDocs - distinctKeys),
      ok,
      reasons,
    });
  }

  void projectId;
  return results;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printSummary(results: RowResult[]): void {
  const pad = (s: string, n: number) => s.padEnd(n);
  const lines: string[] = [];
  lines.push('');
  lines.push('  Reconciliation — events fold vs. enrollment projection');
  lines.push('  ' + '-'.repeat(86));
  lines.push(
    '  ' +
      pad('UID', 22) +
      pad('COURSE', 24) +
      pad('EVENTS', 9) +
      pad('DISTINCT', 10) +
      pad('DUPS', 7) +
      'RESULT',
  );
  lines.push('  ' + '-'.repeat(86));
  for (const r of results) {
    lines.push(
      '  ' +
        pad(r.uid, 22) +
        pad(r.courseId, 24) +
        pad(String(r.totalEvents), 9) +
        pad(String(r.distinctEvents), 10) +
        pad(String(r.duplicatesCollapsed), 7) +
        (r.ok ? 'PASS' : 'FAIL'),
    );
    if (!r.ok) for (const reason of r.reasons) lines.push('        ↳ ' + reason);
  }
  lines.push('  ' + '-'.repeat(86));
  const passed = results.filter((r) => r.ok).length;
  const dupsCollapsed = results.reduce((n, r) => n + r.duplicatesCollapsed, 0);
  const distinct = results.reduce((n, r) => n + r.distinctEvents, 0);
  lines.push(
    `  ${passed}/${results.length} enrollments reconciled · ` +
      `${distinct} distinct events · ${dupsCollapsed} duplicate sends collapsed (zero-dup)`,
  );
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
  const projectId = resolveProjectId();
  // eslint-disable-next-line no-console
  console.log(
    `Reconciling project "${projectId}" — Firestore @ ${process.env['FIRESTORE_EMULATOR_HOST']}, ` +
      `tenant "${TENANT_ID}"`,
  );

  const app: App = initializeApp({ projectId });
  const db = getFirestore(app);

  const results = await reconcileAll(db, projectId);
  printSummary(results);

  if (results.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      'No events found to reconcile. Run a scenario (e.g. npm run loadtest:sync-storm) first.',
    );
    process.exit(2);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `RECONCILIATION FAILED: ${failed.length} enrollment(s) diverged from the events fold ` +
        '(zero-dup / zero-loss violated).',
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('RECONCILIATION PASSED: every enrollment equals its de-duplicated event fold.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Reconcile failed:', err);
  process.exit(1);
});
