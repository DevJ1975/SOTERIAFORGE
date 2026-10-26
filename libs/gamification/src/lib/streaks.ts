/**
 * Pure streak calculation for Soteria ASSURANCE gamification.
 *
 * All comparisons are done on the **UTC calendar date** portion of ISO strings
 * (YYYY-MM-DD), so timezone skew between client and server cannot inflate streaks.
 *
 * Rules:
 *  - Same calendar day (UTC) as the last activity → no change (idempotent).
 *  - Exactly the next calendar day (UTC)           → streak incremented by 1.
 *  - Gap of more than one calendar day             → streak resets to 1.
 *  - No prior activity (`lastActiveISO` is undefined/null) → streak starts at 1.
 *
 * No state; all functions are pure.
 */

export interface StreakResult {
  /** The updated streak length in days. */
  streakDays: number;
  /** `true` when the streak counter was incremented (i.e. a new day was recorded). */
  incremented: boolean;
}

/**
 * Extracts the UTC date string (YYYY-MM-DD) from an ISO datetime string.
 * Only the date portion is used; time and timezone offset are discarded.
 */
function utcDatePart(isoString: string): string {
  // ISO strings have the form: 2024-03-15T10:30:00.000Z or 2024-03-15T10:30:00+05:30
  // We always normalise to UTC by parsing through Date, then extracting Y-M-D.
  const d = new Date(isoString);
  // toISOString always returns UTC: "YYYY-MM-DDTHH:mm:ss.sssZ"
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Returns the difference in UTC calendar days between two dates.
 * Positive means `nowDate` is after `prevDate`.
 */
function calendarDayDiff(prevDateStr: string, nowDateStr: string): number {
  // Parse as UTC midnight timestamps.
  const prev = Date.UTC(
    Number(prevDateStr.slice(0, 4)),
    Number(prevDateStr.slice(5, 7)) - 1,
    Number(prevDateStr.slice(8, 10)),
  );
  const now = Date.UTC(
    Number(nowDateStr.slice(0, 4)),
    Number(nowDateStr.slice(5, 7)) - 1,
    Number(nowDateStr.slice(8, 10)),
  );
  return Math.round((now - prev) / 86_400_000);
}

/**
 * Computes the updated streak given the last active timestamp and the current time.
 *
 * @param lastActiveISO  - ISO 8601 datetime of the previous activity, or `undefined`
 *                         if the member has never been active.
 * @param nowISO         - ISO 8601 datetime of the current activity.
 * @param currentStreak  - The member's current streak counter (≥ 0).
 * @returns A new {@link StreakResult} (never mutates inputs).
 */
export function updateStreak(
  lastActiveISO: string | undefined,
  nowISO: string,
  currentStreak: number,
): StreakResult {
  const nowDate = utcDatePart(nowISO);

  // No prior activity: begin a fresh streak.
  if (lastActiveISO === undefined || lastActiveISO === null) {
    return { streakDays: 1, incremented: true };
  }

  const lastDate = utcDatePart(lastActiveISO);
  const diff = calendarDayDiff(lastDate, nowDate);

  if (diff === 0) {
    // Already active today — idempotent, no change.
    return { streakDays: currentStreak, incremented: false };
  }

  if (diff === 1) {
    // Consecutive day — extend the streak.
    return { streakDays: currentStreak + 1, incremented: true };
  }

  // Gap of 2+ days — streak broken, reset to 1.
  return { streakDays: 1, incremented: true };
}

/**
 * Derives the "last N days" activity strip shown on the learner home (Pulse
 * card) from the server-authoritative streak counter.
 *
 * Returns `length` booleans, oldest first, the last entry being today (UTC).
 * Only the current run is known, so days before it are reported inactive:
 *  - last active today     → the final `streakDays` entries are active;
 *  - last active yesterday → the run ends yesterday, today is still open;
 *  - older / never         → the streak is broken, nothing is active.
 */
export function streakStrip(
  streakDays: number,
  lastActiveISO: string | undefined | null,
  nowISO: string,
  length = 14,
): boolean[] {
  const days = Array.from({ length }, () => false);
  if (!lastActiveISO || streakDays <= 0 || length <= 0) return days;

  const gap = calendarDayDiff(utcDatePart(lastActiveISO), utcDatePart(nowISO));
  if (gap < 0 || gap > 1) return days;

  const end = length - 1 - gap; // index of the last active day
  for (let i = 0; i < Math.min(streakDays, end + 1); i++) {
    days[end - i] = true;
  }
  return days;
}
