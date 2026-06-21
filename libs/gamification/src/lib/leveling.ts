/**
 * Pure XP / level math for Soteria ASSURANCE gamification (UI helpers).
 *
 * ## Single source of truth
 * The **default** curve is NOT redefined here — it is imported from
 * `@assurance/shared` ({@link LEVEL_BASE_XP}, {@link LEVEL_EXPONENT},
 * {@link sharedXpForLevel}), the one module both the server (Cloud Functions
 * authoritative awards) and this UI build on. This guarantees the client and
 * server agree on a member's level at every threshold — fixing the level
 * "flicker" where the server said level 1 and the client said level 2 at the
 * same XP (MO-13a). These helpers add the richer within-level progress info the
 * UI needs (`xpIntoLevel` / `xpToNext`) on top of that shared curve, and keep an
 * optional custom-curve override for callers that want a different shape.
 *
 * ## Default curve
 * Level N requires a **cumulative** total XP of `Math.floor(100 * N^1.5)` to reach.
 * So the XP *threshold* for each level is:
 *   level 1 →    100
 *   level 2 →    282
 *   level 3 →    519
 *   level 4 →    800
 *   …
 * XP cost to advance FROM level N TO level N+1 is `xpForLevel(N+1) - xpForLevel(N)`.
 *
 * No state; all functions are pure.
 */

import { LEVEL_BASE_XP, LEVEL_EXPONENT, xpForLevel as sharedXpForLevel } from '@assurance/shared';

/** Parameters that define the XP curve. */
export interface LevelCurve {
  /**
   * Multiplier for the base cost.
   * @default 100
   */
  baseXp: number;
  /**
   * Exponent applied to the level number.
   * @default 1.5
   */
  exponent: number;
}

/**
 * The default curve, sourced from the canonical `@assurance/shared` constants so
 * there is exactly one `100`/`1.5` in the codebase (no drift between
 * client/server).
 */
const DEFAULT_CURVE: LevelCurve = { baseXp: LEVEL_BASE_XP, exponent: LEVEL_EXPONENT };

/**
 * Returns the **cumulative** XP required to *reach* `level`.
 * Level 1 is the first level (requires `baseXp * 1^exponent` cumulative XP).
 *
 * For the default curve this delegates to the shared {@link sharedXpForLevel} so
 * the UI and server compute identical thresholds; a custom `curve` uses the same
 * floored formula shape.
 *
 * @param level - Must be a positive integer (≥ 1).
 * @param curve - Optional override for the XP curve.
 */
export function xpForLevel(level: number, curve: LevelCurve = DEFAULT_CURVE): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be a positive integer, got ${level}`);
  }
  if (curve === DEFAULT_CURVE) {
    return sharedXpForLevel(level);
  }
  return Math.floor(curve.baseXp * Math.pow(level, curve.exponent));
}

export interface LevelInfo {
  /** The current level (≥ 1). */
  level: number;
  /** XP accumulated within the current level (0 ≤ xpIntoLevel < xpToNext). */
  xpIntoLevel: number;
  /** XP still needed to reach the next level. */
  xpToNext: number;
}

/**
 * Computes the level and within-level progress for a given total XP.
 *
 * Level 1 is always the minimum (even at 0 XP). A member reaches level N when
 * their cumulative XP ≥ `xpForLevel(N)`. Members start at level 1 with 0 XP and
 * advance when they accumulate enough XP to meet the next threshold.
 *
 * - `level`       = highest N such that `xp ≥ xpForLevel(N)`, minimum 1.
 * - `xpIntoLevel` = `xp - xpForLevel(level)` (or just `xp` when still at level 1).
 * - `xpToNext`    = `xpForLevel(level + 1) - xpForLevel(level)` (cost to next level).
 *
 * For the default curve `level` is identical to the server's
 * {@link import('@assurance/shared').levelFromXp} (both derive from the shared
 * curve), so the displayed level never disagrees with the authoritative one.
 *
 * This function caps iteration at level 1000 as a safety guard.
 *
 * @param xp    - Total XP (non-negative).
 * @param curve - Optional curve override.
 */
export function levelForXp(xp: number, curve: LevelCurve = DEFAULT_CURVE): LevelInfo {
  if (xp < 0) {
    throw new RangeError(`xp must be non-negative, got ${xp}`);
  }

  const MAX_LEVEL = 1000;

  // Level 1 is free — members start there. They advance to level N only when
  // their XP reaches xpForLevel(N). So level 2 requires xpForLevel(2) XP, etc.
  // A member below xpForLevel(2) stays at level 1.
  let level = 1;

  while (level < MAX_LEVEL) {
    const thresholdForNext = xpForLevel(level + 1, curve);
    if (thresholdForNext > xp) {
      break;
    }
    level++;
  }

  // Baseline for the current level: level 1 has baseline 0 (free entry).
  const baseline = level === 1 ? 0 : xpForLevel(level, curve);
  const thresholdNext = xpForLevel(level + 1, curve);
  const xpIntoLevel = xp - baseline;
  // Cost to advance from current level to next:
  const xpToNext = thresholdNext - baseline;

  return { level, xpIntoLevel, xpToNext };
}
