/**
 * Platform level curve.
 *
 * Cumulative XP required to *reach* level n is `100·(n−1)·n/2`:
 * L1 = 0, L2 = 100, L3 = 300, L4 = 600, … — i.e. levelling up from
 * level n costs `100·n` XP.
 *
 * NOTE(unify-later): this curve is duplicated by the concurrent backend
 * gamification agent. Once both land, hoist a single implementation into
 * @forge/shared and delete this copy.
 */

/** Snapshot of a learner's position on the level curve. */
export interface LevelProgress {
  /** Current level (1-based). */
  level: number;
  /** XP earned since reaching the current level. */
  intoLevel: number;
  /** XP between the current level and the next (always `100·level`). */
  neededForNext: number;
  /** intoLevel / neededForNext as a whole percentage, 0..100. */
  pct: number;
}

/** Cumulative XP required to reach `level` (1-based). */
export function xpForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 1) return 0;
  const n = Math.floor(level);
  return (100 * (n - 1) * n) / 2;
}

/** Resolves total `xp` onto the level curve. Negative/invalid xp clamps to 0. */
export function levelProgress(xp: number): LevelProgress {
  const total = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  // Invert 100·(n−1)·n/2 ≤ xp, then correct for floating-point drift.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * total)) / 2));
  while (xpForLevel(level + 1) <= total) level += 1;
  while (level > 1 && xpForLevel(level) > total) level -= 1;

  const intoLevel = total - xpForLevel(level);
  const neededForNext = 100 * level;
  const pct = Math.min(100, Math.max(0, Math.round((intoLevel / neededForNext) * 100)));
  return { level, intoLevel, neededForNext, pct };
}
