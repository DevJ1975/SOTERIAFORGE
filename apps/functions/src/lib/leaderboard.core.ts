/**
 * Leaderboard rebuild — SELF-CONTAINED module (Phase 4).
 *
 * This file intentionally declares its own tiny port interfaces, admin-SDK
 * adapters, and v2 trigger builders instead of touching ports.ts/adapters.ts/
 * authz.ts/main.ts, which a concurrent agent owns. main.ts wiring is two
 * lines (see {@link buildRebuildLeaderboardsSchedule} /
 * {@link buildRebuildLeaderboardsCallable}).
 *
 * NOTE(unify-later): LEADERBOARD_PERIODS / entry shapes mirror @forge/shared
 * (lib/schemas/gamification.ts, lib/constants.ts). Kept local so this module
 * compiles independently of in-flight @forge/shared edits; fold back into the
 * shared schemas once both Phase 4 agents land.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableFunction } from 'firebase-functions/v2/https';
import { onSchedule, type ScheduleFunction } from 'firebase-functions/v2/scheduler';

// ---- Local contracts ---------------------------------------------------------

/** Mirrors @forge/shared LEADERBOARD_PERIODS (unify-later). */
export const LEADERBOARD_PERIODS = ['daily', 'weekly', 'allTime'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

/** Cap on entries per leaderboard doc. */
export const LEADERBOARD_TOP_N = 100;

/** The slice of a member doc the rebuild needs. */
export interface MemberLite {
  uid: string;
  displayName?: string;
  avatarUrl?: string;
  xp: number;
  /** ISO datetime of the member's last activity, when known. */
  lastActiveAt?: string;
}

/** Mirrors @forge/shared leaderboardEntry (unify-later). */
export interface LeaderboardEntryLite {
  uid: string;
  displayName?: string;
  avatarUrl?: string;
  xp: number;
  /** 1-based. */
  rank: number;
}

/** Mirrors @forge/shared leaderboard at /tenants/{t}/leaderboard/{period}. */
export interface LeaderboardDocLite {
  tenantId: string;
  period: LeaderboardPeriod;
  entries: LeaderboardEntryLite[];
  createdAt: string;
  updatedAt: string;
}

/** Minimal ports this core depends on (in-memory fakes in the spec). */
export interface LeaderboardDeps {
  listMembers(tenantId: string): Promise<MemberLite[]>;
  setLeaderboard(
    tenantId: string,
    period: LeaderboardPeriod,
    doc: LeaderboardDocLite,
  ): Promise<void>;
}

// ---- Pure window helpers -----------------------------------------------------

/** UTC calendar-day key, e.g. "2026-06-11". Returns null for invalid input. */
export function utcDayKey(value: string | Date | undefined): string | null {
  if (value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** ISO-8601 week key in UTC, e.g. "2026-W24". Returns null for invalid input. */
export function isoWeekKey(value: string | Date | undefined): string | null {
  if (value === undefined) return null;
  const source = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(source.getTime())) return null;
  const date = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()),
  );
  const isoDay = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - isoDay); // shift to the week's Thursday
  const isoYear = date.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Sort by xp desc with a stable uid-ascending tie-break, cap at
 * {@link LEADERBOARD_TOP_N}, and assign 1-based ranks. Optional fields are
 * spread conditionally — Firestore rejects undefined values.
 */
export function rankMembers(members: readonly MemberLite[]): LeaderboardEntryLite[] {
  return [...members]
    .sort((a, b) => b.xp - a.xp || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
    .slice(0, LEADERBOARD_TOP_N)
    .map((member, index) => ({
      uid: member.uid,
      ...(member.displayName !== undefined ? { displayName: member.displayName } : {}),
      ...(member.avatarUrl !== undefined ? { avatarUrl: member.avatarUrl } : {}),
      xp: member.xp,
      rank: index + 1,
    }));
}

// ---- Core --------------------------------------------------------------------

export interface RebuildLeaderboardsResult {
  tenantId: string;
  /** Entry count written per period. */
  counts: Record<LeaderboardPeriod, number>;
}

/**
 * Rebuilds all three leaderboard docs for a tenant from its member roster:
 *
 * - allTime: every member, ranked by total xp.
 * - daily / weekly: members whose `lastActiveAt` falls inside the UTC
 *   calendar day / ISO week containing `now`, ranked by **total** xp.
 *
 * APPROXIMATION (Phase 4.1): daily/weekly rank lifetime xp filtered to
 * members active in the window — not xp *earned within* the window. True
 * windowed xp needs an xpEvents aggregation, which lands with the backend
 * gamification work in Phase 4.1.
 */
export async function rebuildLeaderboardsCore(
  deps: LeaderboardDeps,
  tenantId: string,
  now: Date,
): Promise<RebuildLeaderboardsResult> {
  const members = await deps.listMembers(tenantId);
  const nowIso = now.toISOString();
  const dayKey = utcDayKey(now);
  const weekKey = isoWeekKey(now);

  const rosters: Record<LeaderboardPeriod, readonly MemberLite[]> = {
    allTime: members,
    daily: members.filter((member) => utcDayKey(member.lastActiveAt) === dayKey),
    weekly: members.filter((member) => isoWeekKey(member.lastActiveAt) === weekKey),
  };

  const counts = {} as Record<LeaderboardPeriod, number>;
  for (const period of LEADERBOARD_PERIODS) {
    const entries = rankMembers(rosters[period]);
    counts[period] = entries.length;
    await deps.setLeaderboard(tenantId, period, {
      tenantId,
      period,
      entries,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  return { tenantId, counts };
}

// ---- Callable authorization (pure, locally declared) --------------------------

export type RebuildAuthzDecision =
  | { ok: true; tenantId: string }
  | { ok: false; code: 'permission-denied' | 'invalid-argument'; reason: string };

const AUTHORING_CALLERS = new Set(['superadmin', 'tenant_admin', 'instructor']);

/**
 * Who may invoke the on-demand rebuild: superadmin (with an explicit target
 * tenantId) or in-tenant authoring roles (tenant_admin / instructor), scoped
 * to their own tenant. Local mirror of the authz.ts conventions — that file
 * belongs to the concurrent agent (unify-later).
 */
export function authorizeRebuild(token: unknown, requestedTenantId: unknown): RebuildAuthzDecision {
  const claims =
    typeof token === 'object' && token !== null ? (token as Record<string, unknown>) : null;
  const role = typeof claims?.['role'] === 'string' ? (claims['role'] as string) : null;
  if (!role || !AUTHORING_CALLERS.has(role)) {
    return {
      ok: false,
      code: 'permission-denied',
      reason: 'Caller must be superadmin or an in-tenant authoring role',
    };
  }
  const requested = typeof requestedTenantId === 'string' ? requestedTenantId : undefined;
  if (role === 'superadmin') {
    if (!requested) {
      return {
        ok: false,
        code: 'invalid-argument',
        reason: 'superadmin callers must pass an explicit tenantId',
      };
    }
    return { ok: true, tenantId: requested };
  }
  const ownTenantId =
    typeof claims?.['tenantId'] === 'string' ? (claims['tenantId'] as string) : null;
  if (!ownTenantId) {
    return { ok: false, code: 'permission-denied', reason: 'Caller carries no tenantId claim' };
  }
  if (requested !== undefined && requested !== ownTenantId) {
    return {
      ok: false,
      code: 'permission-denied',
      reason: 'Callers may only rebuild their own tenant',
    };
  }
  return { ok: true, tenantId: ownTenantId };
}

// ---- Admin-SDK adapters (factory; main.ts never constructs these directly) ----

/** LeaderboardDeps plus tenant enumeration for the scheduled sweep. */
export interface LeaderboardAdapters extends LeaderboardDeps {
  listTenantIds(): Promise<string[]>;
}

/** Defensive projection of a raw member doc onto MemberLite. Exported for tests. */
export function toMemberLite(uid: string, data: Record<string, unknown>): MemberLite {
  const xp = typeof data['xp'] === 'number' && Number.isFinite(data['xp']) ? data['xp'] : 0;
  const lastActiveRaw = data['lastActiveAt'];
  // Firestore Timestamps expose toDate(); ISO strings pass through unchanged.
  const lastActiveAt =
    typeof lastActiveRaw === 'string'
      ? lastActiveRaw
      : typeof (lastActiveRaw as { toDate?: () => Date } | null | undefined)?.toDate === 'function'
        ? (lastActiveRaw as { toDate: () => Date }).toDate().toISOString()
        : undefined;
  return {
    uid,
    ...(typeof data['displayName'] === 'string' ? { displayName: data['displayName'] } : {}),
    ...(typeof data['avatarUrl'] === 'string' ? { avatarUrl: data['avatarUrl'] } : {}),
    xp: Math.max(0, Math.floor(xp)),
    ...(lastActiveAt !== undefined ? { lastActiveAt } : {}),
  };
}

/**
 * Real adapters over firebase-admin. Self-contained twin of adapters.ts
 * (which the concurrent agent owns); lazy app init keeps construction safe
 * before main.ts's ensureApp().
 */
export function createLeaderboardAdapters(): LeaderboardAdapters {
  const db = () => getFirestore(getApps()[0] ?? initializeApp());
  const tenantRef = (tenantId: string) => db().collection('tenants').doc(tenantId);
  return {
    async listTenantIds() {
      const snapshot = await db().collection('tenants').get();
      return snapshot.docs.map((doc) => doc.id);
    },

    async listMembers(tenantId) {
      const snapshot = await tenantRef(tenantId).collection('members').get();
      return snapshot.docs
        .filter((doc) => doc.data()['status'] !== 'deactivated')
        .map((doc) => toMemberLite(doc.id, doc.data()));
    },

    async setLeaderboard(tenantId, period, doc) {
      await tenantRef(tenantId).collection('leaderboard').doc(period).set(doc);
    },
  };
}

// ---- v2 trigger builders (main.ts wiring is one line each) ---------------------

/**
 * Hourly sweep: rebuilds every tenant's leaderboards. Per-tenant failures are
 * logged and skipped so one bad tenant never starves the rest.
 *
 * main.ts: `export const rebuildLeaderboardsHourly = buildRebuildLeaderboardsSchedule();`
 */
export function buildRebuildLeaderboardsSchedule(
  adapters: LeaderboardAdapters = createLeaderboardAdapters(),
): ScheduleFunction {
  return onSchedule({ schedule: 'every 1 hours', region: 'us-central1' }, async () => {
    const now = new Date();
    const tenantIds = await adapters.listTenantIds();
    for (const tenantId of tenantIds) {
      try {
        await rebuildLeaderboardsCore(adapters, tenantId, now);
      } catch (err) {
        console.error(`leaderboard rebuild failed for tenant '${tenantId}'`, err);
      }
    }
  });
}

/**
 * On-demand rebuild for authoring/superadmin callers.
 *
 * main.ts: `export const rebuildLeaderboards = buildRebuildLeaderboardsCallable();`
 */
export function buildRebuildLeaderboardsCallable(
  adapters: LeaderboardAdapters = createLeaderboardAdapters(),
): CallableFunction<unknown, Promise<RebuildLeaderboardsResult>> {
  return onCall({ cors: true, region: 'us-central1' }, async (request) => {
    const requestedTenantId = (request.data as { tenantId?: unknown } | null | undefined)?.tenantId;
    const decision = authorizeRebuild(request.auth?.token, requestedTenantId);
    if (!decision.ok) {
      throw new HttpsError(decision.code, decision.reason);
    }
    try {
      return await rebuildLeaderboardsCore(adapters, decision.tenantId, new Date());
    } catch (err) {
      console.error('Unhandled error in rebuildLeaderboards', err);
      throw new HttpsError('internal', 'Internal error');
    }
  });
}
