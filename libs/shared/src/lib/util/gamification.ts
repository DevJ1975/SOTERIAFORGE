/**
 * Pure gamification math usable on both client and server.
 *
 * This module is the **single source of truth** for the XP level curve. Both the
 * backend (authoritative awards in `backend/apps/gamification`) and the Angular UI
 * (`@assurance/gamification`'s richer `levelForXp` helper) build on the canonical
 * {@link xpForLevel} curve defined here, so the client and server can never
 * disagree about a member's level at a threshold (which previously caused a
 * level "flicker" at the boundaries — MO-13a).
 *
 * Dependency-free and Node-safe: imported by Node tooling and Angular.
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
