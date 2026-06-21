/**
 * Tests for `recordModuleCompletion` (FIX-2): the first-completion gate is
 * atomic, so calling it twice for the same module grants member XP/badges once
 * and upserts the period leaderboards once.
 *
 * `./admin` (which calls `initializeApp()` on import) and `./gamification`'s
 * `upsertLeaderboards` (which talks to Firestore) are mocked with an in-memory
 * Firestore double that survives across calls, so a second call observes the
 * first call's committed enrollment state.
 */

interface DocData {
  [k: string]: unknown;
}

/** In-memory document store keyed by path. */
const store = new Map<string, DocData>();
/** Per-collection child paths so `collection(path).get().size` works. */
const collections = new Map<string, Set<string>>();

function getField(data: DocData | undefined, field: string): unknown {
  if (!data) return undefined;
  if (field in data) return data[field];
  // Firestore supports dotted field paths (e.g. 'cmi.completedModuleIds').
  const parts = field.split('.');
  let cur: unknown = data;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as DocData)) {
      cur = (cur as DocData)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function snapFor(path: string) {
  const data = store.get(path);
  return {
    exists: data !== undefined,
    id: path.split('/').pop(),
    data: () => data,
    get: (field: string) => getField(data, field),
  };
}

/** Deep-ish merge mirroring Firestore `{merge:true}` (nested plain objects merge). */
function mergeData(target: DocData, patch: DocData): DocData {
  const out: DocData = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === 'object' &&
      !Array.isArray(out[k])
    ) {
      out[k] = mergeData(out[k] as DocData, v as DocData);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function setDoc(path: string, data: DocData, opts?: { merge?: boolean }): void {
  const prev = store.get(path);
  store.set(path, opts?.merge && prev ? mergeData(prev, data) : { ...data });
  const parent = path.slice(0, path.lastIndexOf('/'));
  const siblings = collections.get(parent) ?? new Set<string>();
  siblings.add(path);
  collections.set(parent, siblings);
}

const fakeDb = {
  doc: (path: string) => ({
    path,
    get: async () => snapFor(path),
  }),
  collection: (path: string) => ({
    path,
    get: async () => ({ size: collections.get(path)?.size ?? 0 }),
  }),
  runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: async (ref: { path: string }) => snapFor(ref.path),
      set: (ref: { path: string }, data: DocData, opts?: { merge?: boolean }) =>
        setDoc(ref.path, data, opts),
    };
    return fn(tx);
  },
};

jest.mock('./admin', () => ({ db: fakeDb }));

const upsertLeaderboards = jest.fn().mockResolvedValue(undefined);
jest.mock('./gamification', () => {
  const actual = jest.requireActual('./gamification');
  return { ...actual, upsertLeaderboards };
});

import { recordModuleCompletion } from './completion';

const T = 'acme';
const C = 'course-1';
const M = 'mod-1';
const U = 'user-1';

function seed(opts?: { totalModules?: number; moduleXp?: number; courseBadges?: string[] }): void {
  store.clear();
  collections.clear();
  const total = opts?.totalModules ?? 2;
  for (let i = 0; i < total; i++) {
    const id = i === 0 ? M : `mod-${i + 1}`;
    setDoc(`tenants/${T}/courses/${C}/modules/${id}`, {
      xpReward: id === M ? (opts?.moduleXp ?? 50) : 0,
      badgeRefs: id === M ? ['badge-mod'] : [],
    });
  }
  setDoc(`tenants/${T}/courses/${C}`, { badgeRefs: opts?.courseBadges ?? ['badge-course'] });
}

describe('recordModuleCompletion — atomic first-completion gate (FIX-2)', () => {
  beforeEach(() => {
    upsertLeaderboards.mockClear();
    seed();
  });

  it('awards XP/badges once and upserts the period board once across two calls', async () => {
    const now = '2026-06-21T10:00:00.000Z';

    const first = await recordModuleCompletion({
      tenantId: T,
      courseId: C,
      moduleId: M,
      uid: U,
      nowISO: now,
    });
    expect(first.firstCompletion).toBe(true);
    expect(first.progressPct).toBe(50); // 1 of 2 modules

    const member1 = store.get(`tenants/${T}/members/${U}`);
    expect(member1?.['xp']).toBe(50);
    expect(member1?.['earnedBadgeIds']).toEqual(['badge-mod']);

    // Second call for the SAME module — must be a no-op for rewards.
    const second = await recordModuleCompletion({
      tenantId: T,
      courseId: C,
      moduleId: M,
      uid: U,
      nowISO: '2026-06-21T10:05:00.000Z',
    });
    expect(second.firstCompletion).toBe(false);

    const member2 = store.get(`tenants/${T}/members/${U}`);
    expect(member2?.['xp']).toBe(50); // NOT 100
    expect(member2?.['earnedBadgeIds']).toEqual(['badge-mod']);

    // Period leaderboards upserted exactly once (only on the genuine first).
    expect(upsertLeaderboards).toHaveBeenCalledTimes(1);
    expect(upsertLeaderboards).toHaveBeenCalledWith(T, expect.objectContaining({ uid: U }), {
      xpDelta: 50,
      newXp: 50,
    });
  });

  it('grants course badges and marks completed when the final module is completed', async () => {
    seed({ totalModules: 1 }); // single module → completing it completes the course
    const result = await recordModuleCompletion({
      tenantId: T,
      courseId: C,
      moduleId: M,
      uid: U,
      nowISO: '2026-06-21T10:00:00.000Z',
    });
    expect(result.completed).toBe(true);
    expect(result.progressPct).toBe(100);

    const member = store.get(`tenants/${T}/members/${U}`);
    expect(member?.['earnedBadgeIds']).toEqual(
      expect.arrayContaining(['badge-mod', 'badge-course']),
    );
  });

  it('adds extraXp (e.g. quiz points) into the single award', async () => {
    const result = await recordModuleCompletion({
      tenantId: T,
      courseId: C,
      moduleId: M,
      uid: U,
      nowISO: '2026-06-21T10:00:00.000Z',
      extraXp: 30,
      score: 90,
    });
    expect(result.firstCompletion).toBe(true);
    const member = store.get(`tenants/${T}/members/${U}`);
    expect(member?.['xp']).toBe(80); // 50 module + 30 extra
    const enroll = store.get(`tenants/${T}/courses/${C}/enrollments/${U}`);
    expect(enroll?.['score']).toBe(90);
  });

  it('does not upsert leaderboards when xpDelta is 0', async () => {
    seed({ moduleXp: 0, totalModules: 2 });
    await recordModuleCompletion({
      tenantId: T,
      courseId: C,
      moduleId: M,
      uid: U,
      nowISO: '2026-06-21T10:00:00.000Z',
    });
    expect(upsertLeaderboards).not.toHaveBeenCalled();
  });
});
