/**
 * Local mirror of the backend XP award for hazard-hunter results.
 *
 * The onGameResultCreated Cloud Function stamps
 * `xpAwarded = min(150, round(score / 10))` onto the gameResults doc a few
 * seconds after the client write. This mirror exists only so the scorecard
 * can show the '+{n} XP' chip immediately — the server value is authoritative.
 */
export const HAZARD_HUNTER_XP_CAP = 150;

/** XP the backend will award for a hazard-hunter shift with this score. */
export function hazardHunterXp(score: number): number {
  return Math.min(HAZARD_HUNTER_XP_CAP, Math.round(score / 10));
}
