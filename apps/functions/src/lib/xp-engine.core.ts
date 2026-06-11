import { levelForXp } from '@forge/shared';
import type { GameId, PlatformBadgeId, XpReason } from '@forge/shared';

/**
 * Pure gamification engine: given a member's current gamification state and
 * one XP-worthy event, compute the XP delta, the ledger entries to write, the
 * new level/streak/counters, and any platform badges newly earned.
 *
 * No I/O — persistence (member doc, xpEvents ledger, awards) is the trigger
 * cores' job. Multi-event writes (e.g. several lessons completed in one
 * enrollment write) are handled by folding: feed each event the state returned
 * by the previous call (see {@link stateAfter}).
 */

/** XP award amounts (fixed platform contract). */
export const XP_PER_LESSON = 50;
export const XP_PER_COURSE = 200;
export const XP_PERIL_WIN = 150;
export const XP_PERIL_LOSS = 40;
export const XP_HAZARD_HUNTER_CAP = 150;

/** Badge thresholds. */
const COURSE_CRUSHER_COUNT = 5;
const ON_FIRE_STREAK_DAYS = 7;
const SHARPSHOOTER_MIN_SCORE = 95;

/**
 * The slice of the member doc the engine reads and rewrites. `completedCourses`
 * and `gamesPlayed` are server-side bookkeeping counters maintained by the
 * triggers (not part of the client-facing member schema, which strips them on
 * parse) — they let badges be computed without collection scans.
 */
export interface MemberGamificationState {
  xp?: number;
  level?: number;
  streakDays?: number;
  lastActiveAt?: string;
  completedCourses?: number;
  gamesPlayed?: number;
}

/** One XP-worthy occurrence, as detected by a trigger core. */
export type GamificationEvent =
  | { kind: 'lesson'; sourceRef: string }
  | { kind: 'course'; score?: number; sourceRef: string }
  | { kind: 'game'; game: GameId; score: number; won?: boolean; sourceRef: string };

/** A ledger entry to persist (id/uid/tenantId are added by the trigger core). */
export interface XpEventDraft {
  amount: number;
  reason: XpReason;
  sourceRef: string;
  at: string;
}

export interface XpEngineResult {
  xpDelta: number;
  newXp: number;
  newLevel: number;
  newStreakDays: number;
  /** New value of the member's completed-courses counter. */
  completedCourses: number;
  /** New value of the member's games-played counter. */
  gamesPlayed: number;
  xpEvents: XpEventDraft[];
  /**
   * Badges whose earning condition was crossed by THIS event (computed from
   * the post-update state + counters). The persisting core must still guard
   * against double-awards via an award-exists check — duplicate trigger
   * deliveries can replay a crossing.
   */
  badgesEarned: PlatformBadgeId[];
}

function intOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Defensive extraction of the gamification slice from a raw member doc. */
export function memberStateOf(doc: Record<string, unknown>): MemberGamificationState {
  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  const state: MemberGamificationState = {};
  const xp = num(doc['xp']);
  if (xp !== undefined) state.xp = xp;
  const level = num(doc['level']);
  if (level !== undefined) state.level = level;
  const streakDays = num(doc['streakDays']);
  if (streakDays !== undefined) state.streakDays = streakDays;
  if (typeof doc['lastActiveAt'] === 'string') state.lastActiveAt = doc['lastActiveAt'];
  const completedCourses = num(doc['completedCourses']);
  if (completedCourses !== undefined) state.completedCourses = completedCourses;
  const gamesPlayed = num(doc['gamesPlayed']);
  if (gamesPlayed !== undefined) state.gamesPlayed = gamesPlayed;
  return state;
}

/** Calendar day number (days since epoch) of an ISO timestamp, in UTC. */
function utcDayOf(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000);
}

/**
 * Streak transition, on every XP-awarding event (UTC-date diff vs
 * member.lastActiveAt): same day — unchanged; exactly the previous day —
 * streakDays + 1; anything else (including no/invalid lastActiveAt) — reset
 * to 1.
 */
export function nextStreakDays(
  streakDays: number,
  lastActiveAt: string | undefined,
  now: string,
): number {
  const last = lastActiveAt === undefined ? null : utcDayOf(lastActiveAt);
  const today = utcDayOf(now);
  if (last === null || today === null) return 1;
  if (today === last) return streakDays;
  if (today === last + 1) return streakDays + 1;
  return 1;
}

/** XP for one game result: hazard-hunter round(score/10) capped; peril win/lose. */
export function gameXp(game: GameId, score: number, won: boolean | undefined): number {
  if (game === 'peril') {
    return won === true ? XP_PERIL_WIN : XP_PERIL_LOSS;
  }
  return Math.min(XP_HAZARD_HUNTER_CAP, Math.round(score / 10));
}

/** Apply one gamification event to a member snapshot. Pure and deterministic. */
export function applyGamificationEvent(
  member: MemberGamificationState,
  event: GamificationEvent,
  now: string,
): XpEngineResult {
  const xp = Math.max(0, intOr(member.xp, 0));
  const streakBefore = Math.max(0, intOr(member.streakDays, 0));
  const coursesBefore = Math.max(0, intOr(member.completedCourses, 0));
  const gamesBefore = Math.max(0, intOr(member.gamesPlayed, 0));

  const xpEvents: XpEventDraft[] = [];
  let completedCourses = coursesBefore;
  let gamesPlayed = gamesBefore;

  switch (event.kind) {
    case 'lesson':
      xpEvents.push({
        amount: XP_PER_LESSON,
        reason: 'lesson_completed',
        sourceRef: event.sourceRef,
        at: now,
      });
      break;
    case 'course': {
      xpEvents.push({
        amount: XP_PER_COURSE,
        reason: 'course_completed',
        sourceRef: event.sourceRef,
        at: now,
      });
      if (event.score !== undefined) {
        xpEvents.push({
          amount: Math.round(event.score),
          reason: 'score_bonus',
          sourceRef: event.sourceRef,
          at: now,
        });
      }
      completedCourses = coursesBefore + 1;
      break;
    }
    case 'game':
      xpEvents.push({
        amount: gameXp(event.game, event.score, event.won),
        reason: 'game_result',
        sourceRef: event.sourceRef,
        at: now,
      });
      gamesPlayed = gamesBefore + 1;
      break;
  }

  const xpDelta = xpEvents.reduce((sum, e) => sum + e.amount, 0);
  const newXp = xp + xpDelta;
  const newStreakDays = nextStreakDays(streakBefore, member.lastActiveAt, now);

  // Badges: crossing semantics on the post-update state, so a badge is only
  // reported by the event that earned it (idempotence guard #1; the
  // award-exists check at persistence time is guard #2).
  const badgesEarned: PlatformBadgeId[] = [];
  if (event.kind === 'course') {
    if (coursesBefore === 0) badgesEarned.push('first-steps');
    if (coursesBefore < COURSE_CRUSHER_COUNT && completedCourses >= COURSE_CRUSHER_COUNT) {
      badgesEarned.push('course-crusher');
    }
    if (event.score !== undefined && event.score >= SHARPSHOOTER_MIN_SCORE) {
      badgesEarned.push('sharpshooter');
    }
  }
  if (event.kind === 'game') {
    if (gamesBefore === 0) badgesEarned.push('arcade-initiate');
    if (event.game === 'peril' && event.won === true) {
      badgesEarned.push('high-roller');
    }
  }
  if (streakBefore < ON_FIRE_STREAK_DAYS && newStreakDays >= ON_FIRE_STREAK_DAYS) {
    badgesEarned.push('on-fire');
  }

  return {
    xpDelta,
    newXp,
    newLevel: levelForXp(newXp),
    newStreakDays,
    completedCourses,
    gamesPlayed,
    xpEvents,
    badgesEarned,
  };
}

/** The member state after applying a result — feed this into the next event. */
export function stateAfter(result: XpEngineResult, now: string): MemberGamificationState {
  return {
    xp: result.newXp,
    level: result.newLevel,
    streakDays: result.newStreakDays,
    lastActiveAt: now,
    completedCourses: result.completedCourses,
    gamesPlayed: result.gamesPlayed,
  };
}
