/**
 * Pure gamification math usable on both client and server (Cloud Functions).
 * The XP curve mirrors @forge/gamification's richer UI helpers; this module is
 * the minimal, dependency-free version the backend uses for authoritative
 * awards. Keep the curve in sync if either changes.
 */

/** Cumulative XP curve: reaching level N requires 100 * N^1.5 total XP. */
export function levelFromXp(xp: number): number {
  let level = 1;
  while (100 * Math.pow(level + 1, 1.5) <= xp) level++;
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
