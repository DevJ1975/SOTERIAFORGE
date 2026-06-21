/**
 * Pure leaderboard-entry math, free of any Firestore/admin import so it is fully
 * unit-testable headlessly. The Firestore reads/writes live in
 * {@link import('./gamification').upsertLeaderboards}; the cron resets live in
 * `scheduled/leaderboard-reset.ts`.
 */

/** A denormalized leaderboard entry (mirrors `leaderboardEntry` in @assurance/shared). */
export interface LeaderboardEntryData {
  uid: string;
  displayName?: string;
  avatarUrl?: string;
  xp: number;
}

/** A ranked leaderboard entry (entry + its 1-based position). */
export interface RankedLeaderboardEntry extends LeaderboardEntryData {
  rank: number;
}

/** Maximum number of ranked entries persisted per board. */
export const LEADERBOARD_MAX_ENTRIES = 100;

/**
 * Apply a single member's contribution to a leaderboard's entries, returning a
 * new, re-sorted, re-ranked, truncated array (the input is never mutated).
 *
 * - `mode: 'set'` replaces the member's stored `xp` with `value` (used for the
 *   **allTime** board, which mirrors the member's cumulative XP).
 * - `mode: 'add'` adds `value` to the member's existing `xp` within this board,
 *   starting from 0 if they have no entry yet (used for the **daily/weekly**
 *   boards, which accumulate only the XP earned within the current period and so
 *   grow from 0 after each scheduled reset — MO-13b).
 *
 * Entries are sorted by `xp` descending, ranked 1..N, and truncated to
 * {@link LEADERBOARD_MAX_ENTRIES}.
 */
export function applyLeaderboardEntry(
  entries: readonly LeaderboardEntryData[],
  member: Omit<LeaderboardEntryData, 'xp'>,
  mode: 'set' | 'add',
  value: number,
): RankedLeaderboardEntry[] {
  const existing = entries.find((e) => e.uid === member.uid);
  const others = entries.filter((e) => e.uid !== member.uid);

  const nextXp = mode === 'set' ? value : (existing?.xp ?? 0) + value;

  const updated: LeaderboardEntryData = {
    uid: member.uid,
    // Prefer the freshest profile fields, falling back to whatever was stored.
    displayName: member.displayName ?? existing?.displayName,
    avatarUrl: member.avatarUrl ?? existing?.avatarUrl,
    xp: nextXp,
  };

  return [...others, updated]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, LEADERBOARD_MAX_ENTRIES)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
