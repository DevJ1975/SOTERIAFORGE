/**
 * Pure gamification math usable on both client and server (Cloud Functions).
 *
 * This module is the **single source of truth** for the XP level curve. Both the
 * backend (authoritative awards in `apps/functions`) and the Angular UI
 * (`@assurance/gamification`'s richer `levelForXp` helper) build on the canonical
 * {@link xpForLevel} curve defined here, so the client and server can never
 * disagree about a member's level at a threshold (which previously caused a
 * level "flicker" at the boundaries — MO-13a).
 *
 * Dependency-free and Node-safe: imported by Cloud Functions (Node) and Angular.
 */

/** Multiplier for the base XP cost of the canonical curve. */
export const LEVEL_BASE_XP = 100;
/** Exponent applied to the level number in the canonical curve. */
export const LEVEL_EXPONENT = 1.5;

/**
 * Canonical cumulative XP curve: reaching level `N` requires
 * `Math.floor(LEVEL_BASE_XP * N^LEVEL_EXPONENT)` total XP.
 *
 * The `Math.floor` is load-bearing — it is what keeps the server and client in
 * agreement (e.g. level 2 starts at exactly 282 XP, not 282.84…). `levelFromXp`
 * and the UI's `levelForXp` both derive from this function.
 *
 * @param level - Positive integer (≥ 1).
 */
export function xpForLevel(level: number): number {
  return Math.floor(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

/**
 * Cumulative XP curve → level number. A member is level `N` when their total XP
 * is at least `xpForLevel(N)`; level 1 is the floor (even at 0 XP).
 *
 * Returns just the level number (the server uses this directly); the UI uses
 * {@link import('@assurance/gamification').levelForXp} for within-level progress.
 */
export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

const dayUTC = (iso: string): number => {
  const d = new Date(iso);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
};

export interface StreakUpdate {
  streakDays: number;
  incremented: boolean;
}

/**
 * Daily-activity streak. Same UTC calendar day → unchanged; the next
 * consecutive day → +1; a gap of more than one day → reset to 1.
 */
export function nextStreak(
  lastActiveISO: string | undefined,
  nowISO: string,
  currentStreak: number,
): StreakUpdate {
  if (!lastActiveISO) return { streakDays: Math.max(1, currentStreak || 1), incremented: true };
  const diff = dayUTC(nowISO) - dayUTC(lastActiveISO);
  if (diff <= 0) return { streakDays: currentStreak || 1, incremented: false };
  if (diff === 1) return { streakDays: (currentStreak || 0) + 1, incremented: true };
  return { streakDays: 1, incremented: true };
}

/** Upper bound (in days of inactivity) past which a streak is abandoned and not nudged. */
export const STREAK_REMINDER_DECAY_DAYS = 7;

/** The member fields {@link shouldSendStreakReminder} reads (a slice of `Member`). */
export interface StreakReminderCandidate {
  /** Current consecutive-day streak. */
  streakDays?: number;
  /** ISO timestamp of the member's last activity (drives the streak). */
  lastActiveAt?: string;
  /** ISO timestamp of the last streak reminder sent (the daily cap, server-written). */
  lastStreakReminderAt?: string;
}

/**
 * Behavior-triggered streak-reminder selection + daily cap (MO-11), pure and
 * Node-safe so it is fully unit-testable headlessly (the scheduled function and
 * FCM delivery are the only integration parts).
 *
 * Returns `true` when **all** hold:
 *  - the member has a live streak (`streakDays > 0`) worth protecting;
 *  - they have **not** been active today (UTC) — i.e. `lastActiveAt` is on a
 *    strictly earlier UTC day, so the streak breaks unless they return today;
 *  - the inactivity gap is within the {@link STREAK_REMINDER_DECAY_DAYS}-day
 *    decay window (we stop nudging an abandoned streak after 7 days, mirroring
 *    Duolingo's decay) — the canonical at-risk case is exactly the previous day;
 *  - we have not already reminded them today (`lastStreakReminderAt` is on an
 *    earlier UTC day or absent) — the idempotent daily cap (≤1/day).
 *
 * All "today" comparisons are by UTC calendar day; callers pass `nowISO` so the
 * function stays pure.
 */
export function shouldSendStreakReminder(member: StreakReminderCandidate, nowISO: string): boolean {
  const streak = member.streakDays ?? 0;
  if (streak <= 0) return false;
  if (!member.lastActiveAt) return false;

  const today = dayUTC(nowISO);

  // Active today already → streak is safe, nothing to nudge.
  const inactiveDays = today - dayUTC(member.lastActiveAt);
  if (inactiveDays < 1) return false;
  // Abandoned beyond the decay window → stop nudging.
  if (inactiveDays > STREAK_REMINDER_DECAY_DAYS) return false;

  // Daily cap: already reminded today → skip (idempotent).
  if (member.lastStreakReminderAt && dayUTC(member.lastStreakReminderAt) >= today) {
    return false;
  }

  return true;
}
