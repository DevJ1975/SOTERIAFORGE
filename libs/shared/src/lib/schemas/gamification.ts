import { z } from 'zod';
import { LEADERBOARD_PERIODS } from '../constants';
import { auditable, count, docId, isoDateTime, tenantId, uid } from './primitives';

/**
 * Open Badges 3.0 / 1EdTech Verifiable Credential metadata.
 * /tenants/{tenantId}/badges/{badgeId}
 */
export const badge = auditable.extend({
  id: docId,
  tenantId,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  imageUrl: z.string().url().optional(),
  /** Human-readable criteria narrative (Open Badges `criteria`). */
  criteria: z.string().max(2000).default(''),
  /** Issuer profile id (resolves to the tenant or platform issuer). */
  issuerId: z.string().optional(),
});
export type Badge = z.infer<typeof badge>;

/** A leaderboard entry, denormalized for read performance. */
export const leaderboardEntry = z.object({
  uid,
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  xp: count,
  rank: count,
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntry>;

/** /tenants/{tenantId}/leaderboard/{period} */
export const leaderboard = auditable.extend({
  tenantId,
  period: z.enum(LEADERBOARD_PERIODS),
  entries: z.array(leaderboardEntry).default([]),
});
export type Leaderboard = z.infer<typeof leaderboard>;

// ---- XP ledger ---------------------------------------------------------------

/** Why an XP event was awarded. Keep aligned with the xp-engine Cloud Function. */
export const XP_REASONS = [
  'lesson_completed',
  'course_completed',
  'score_bonus',
  'game_result',
] as const;
export type XpReason = (typeof XP_REASONS)[number];

/**
 * One immutable XP ledger entry, written exclusively by Cloud Functions.
 * /tenants/{tenantId}/members/{uid}/xpEvents/{eventId}
 */
export const xpEvent = z.object({
  id: docId,
  uid,
  tenantId,
  amount: z.number().int(),
  reason: z.enum(XP_REASONS),
  /** What earned the XP, e.g. "courses/c1/lessons/l1" or "gameResults/r1". */
  sourceRef: z.string().min(1).max(1500),
  at: isoDateTime,
});
export type XpEvent = z.infer<typeof xpEvent>;

// ---- Badge awards ------------------------------------------------------------

/**
 * A badge earned by a member, written exclusively by Cloud Functions.
 * /tenants/{tenantId}/members/{uid}/awards/{badgeId}
 *
 * `credential` is an Open Badges 3.0 / W3C Verifiable Credential JSON document
 * (unsigned for now; cryptographic proof arrives with production issuer keys).
 */
export const badgeAward = z.object({
  badgeId: docId,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  earnedAt: isoDateTime,
  credential: z.record(z.string(), z.unknown()),
});
export type BadgeAward = z.infer<typeof badgeAward>;

// ---- Game results ------------------------------------------------------------

/** Interactive games that report results to the gamification engine. */
export const GAME_IDS = ['hazard-hunter', 'peril'] as const;
export type GameId = (typeof GAME_IDS)[number];

/**
 * A finished game run, created by the player's own client.
 * /tenants/{tenantId}/gameResults/{resultId}
 *
 * `xpAwarded` is stamped back by the onGameResultCreated Cloud Function once
 * XP has been credited — its presence marks the result as processed.
 */
export const gameResult = z.object({
  id: docId,
  uid,
  tenantId,
  game: z.enum(GAME_IDS),
  score: z.number().int().nonnegative(),
  maxScore: count.optional(),
  won: z.boolean().optional(),
  at: isoDateTime,
  xpAwarded: count.optional(),
});
export type GameResult = z.infer<typeof gameResult>;

// ---- PERIL! realtime matches ---------------------------------------------------

/** Lifecycle of a realtime PERIL! match. */
export const PERIL_MATCH_STATUSES = ['open', 'playing', 'finished', 'abandoned'] as const;
export type PerilMatchStatus = (typeof PERIL_MATCH_STATUSES)[number];

/** A PERIL! stage seats at most three contestants. */
export const PERIL_MATCH_MAX_PLAYERS = 3;

/** One seated (human) contestant in a realtime match. */
export const perilMatchPlayer = z.object({
  uid,
  displayName: z.string().min(1).max(200),
  joinedAt: isoDateTime,
});
export type PerilMatchPlayer = z.infer<typeof perilMatchPlayer>;

/**
 * A realtime PERIL! match (lobby + live session), host-authoritative.
 * /tenants/{tenantId}/matches/{matchId}
 *
 * `seed` drives deterministic clue selection (Daily Double placement, option
 * shuffles) so every client renders the identical board.
 */
export const perilMatch = z.object({
  id: docId,
  tenantId,
  hostUid: uid,
  status: z.enum(PERIL_MATCH_STATUSES),
  createdAt: isoDateTime,
  players: z.array(perilMatchPlayer).max(PERIL_MATCH_MAX_PLAYERS),
  seed: z.number().int(),
  updatedAt: isoDateTime,
});
export type PerilMatch = z.infer<typeof perilMatch>;

/**
 * Kinds of match events. Players append buzz/answer/wager/select events for
 * their own actions; 'state' events are host-published snapshots of the
 * authoritative game state.
 */
export const PERIL_MATCH_EVENT_TYPES = ['buzz', 'answer', 'wager', 'select', 'state'] as const;
export type PerilMatchEventType = (typeof PERIL_MATCH_EVENT_TYPES)[number];

/**
 * One append-only match event.
 * /tenants/{tenantId}/matches/{matchId}/events/{eventId}
 */
export const perilMatchEvent = z.object({
  id: docId,
  matchId: docId,
  uid,
  at: isoDateTime,
  type: z.enum(PERIL_MATCH_EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()),
});
export type PerilMatchEvent = z.infer<typeof perilMatchEvent>;

// ---- Level curve -------------------------------------------------------------
//
// Triangular curve: reaching level n costs a cumulative 100·(n−1)·n/2 XP, so
// each level-up costs 100 XP more than the previous one.
//   L1 = 0, L2 = 100, L3 = 300, L4 = 600, L5 = 1000, …

/** Cumulative XP threshold to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be a positive integer, got ${level}`);
  }
  return (100 * (level - 1) * level) / 2;
}

/** The level a member with `xp` total XP has reached (minimum 1). */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  // Solve 50·(n−1)·n ≤ xp for the largest integer n, then correct any
  // floating-point drift at the exact thresholds.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / 100)) / 2));
  while (xpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpForLevel(level) > xp) level -= 1;
  return level;
}

// ---- Platform badges ---------------------------------------------------------

/** A platform-defined badge: fixed ids, awarded automatically by the xp-engine. */
export interface PlatformBadge {
  id: string;
  name: string;
  description: string;
  /** Human-readable criteria narrative (Open Badges `criteria.narrative`). */
  criteria: string;
}

/**
 * Badges defined in code and awarded by the gamification Cloud Functions.
 * Ids are stable contract values — they key the award docs at
 * /tenants/{tenantId}/members/{uid}/awards/{badgeId}.
 */
export const PLATFORM_BADGES = [
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Completed your first course.',
    criteria: 'Complete any course for the first time.',
  },
  {
    id: 'course-crusher',
    name: 'Course Crusher',
    description: 'Completed five courses.',
    criteria: 'Complete five courses.',
  },
  {
    id: 'on-fire',
    name: 'On Fire',
    description: 'Kept a seven-day learning streak alive.',
    criteria: 'Earn XP on seven consecutive days.',
  },
  {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    description: 'Completed a course with a score of 95 or better.',
    criteria: 'Complete a course with a score of at least 95%.',
  },
  {
    id: 'arcade-initiate',
    name: 'Arcade Initiate',
    description: 'Recorded your first game result.',
    criteria: 'Finish any game in the arcade for the first time.',
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    description: 'Won a round of Peril.',
    criteria: 'Win a game of Peril.',
  },
] as const satisfies readonly PlatformBadge[];

export type PlatformBadgeId = (typeof PLATFORM_BADGES)[number]['id'];

/** Lookup a platform badge definition by its fixed id. */
export function platformBadgeById(badgeId: string): PlatformBadge | undefined {
  return PLATFORM_BADGES.find((badge) => badge.id === badgeId);
}
