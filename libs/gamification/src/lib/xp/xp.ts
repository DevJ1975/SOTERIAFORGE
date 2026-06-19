/**
 * Pure, framework-free XP / leveling engine for Soteria Forge gamification.
 *
 * ## The curve
 * A smooth quadratic (triangular) threshold. The *incremental* cost to climb
 * from level `L` to `L + 1` grows linearly:
 *
 * ```
 * cost(L -> L + 1) = BASE_XP * L          // 100, 200, 300, ...
 * ```
 *
 * So the *cumulative* XP required to first reach level `L` (L >= 1) is the
 * triangular sum of those costs:
 *
 * ```
 * xpForLevel(L) = BASE_XP * (L - 1) * L / 2
 * ```
 *
 * | level | cumulative xp | cost to next |
 * | ----- | ------------- | ------------ |
 * |   1   |        0      |     100      |
 * |   2   |      100      |     200      |
 * |   3   |      300      |     300      |
 * |   4   |      600      |     400      |
 * |   5   |    1 000      |     500      |
 *
 * Level 1 is the floor: any xp in `[0, 100)` is level 1, and negative or
 * non-finite xp clamps to level 1 with zero progress. The inverse
 * {@link levelForXp} solves the quadratic `BASE_XP * (L - 1) * L / 2 <= xp`,
 * guaranteeing `levelForXp(xpForLevel(L)) === L` for every integer level.
 */

/** XP cost of the first level-up (level 1 -> 2). The curve scales from here. */
export const BASE_XP = 100;

/** Lowest level any member can hold. */
export const MIN_LEVEL = 1;

/** Coerce arbitrary input into a finite, non-negative xp value. */
function normalizeXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return xp;
}

/**
 * Cumulative XP required to first reach `level`.
 *
 * Inverse of {@link levelForXp}. `xpForLevel(1) === 0`. Levels below
 * {@link MIN_LEVEL} clamp to the level-1 floor (0 xp).
 */
export function xpForLevel(level: number): number {
  const l = Number.isFinite(level) ? Math.max(MIN_LEVEL, Math.floor(level)) : MIN_LEVEL;
  return (BASE_XP * (l - 1) * l) / 2;
}

/**
 * The (monotonic) level for a given xp total.
 *
 * Solves `BASE_XP * (L - 1) * L / 2 <= xp` for the largest integer `L`:
 * `L = floor((1 + sqrt(1 + 8 * xp / BASE_XP)) / 2)`. Always `>= MIN_LEVEL`.
 * A small epsilon guard keeps exact thresholds (e.g. xp === 300 -> level 3)
 * from being lost to floating-point rounding.
 */
export function levelForXp(xp: number): number {
  const safe = normalizeXp(xp);
  const level = Math.floor((1 + Math.sqrt(1 + (8 * safe) / BASE_XP)) / 2 + 1e-9);
  return Math.max(MIN_LEVEL, level);
}

/** Progress of an xp total within its current level. */
export interface LevelProgress {
  /** Current level (>= {@link MIN_LEVEL}). */
  level: number;
  /** XP accumulated since the start of the current level. */
  intoLevel: number;
  /** Total XP between the current level and the next one. */
  span: number;
  /** Fraction of the way to the next level, clamped to `[0, 1]`. */
  pct: number;
}

/**
 * Decompose an xp total into its level and progress toward the next level.
 *
 * `intoLevel = xp - xpForLevel(level)`, `span = xpForLevel(level + 1) -
 * xpForLevel(level)` (always > 0), and `pct = intoLevel / span` clamped to
 * `[0, 1]`. At an exact threshold `pct` is 0 (start of the fresh level).
 */
export function levelProgress(xp: number): LevelProgress {
  const safe = normalizeXp(xp);
  const level = levelForXp(safe);
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const intoLevel = safe - floor;
  const pct = span > 0 ? Math.min(1, Math.max(0, intoLevel / span)) : 0;
  return { level, intoLevel, span, pct };
}

/** Default XP awarded for completing a course with no explicit reward. */
export const DEFAULT_COURSE_XP = 100;

/**
 * XP earned for completing a course.
 *
 * Honors the course's `xpReward` when it is a finite, non-negative number;
 * otherwise falls back to {@link DEFAULT_COURSE_XP}. The value is floored so
 * downstream xp totals stay integral.
 */
export function courseCompletionXp(course: { xpReward?: number }): number {
  const reward = course?.xpReward;
  if (typeof reward === 'number' && Number.isFinite(reward) && reward >= 0) {
    return Math.floor(reward);
  }
  return DEFAULT_COURSE_XP;
}
