/**
 * Pure leaderboard ranking utilities for Soteria FORGE gamification.
 *
 * ## Tie-breaking / ranking strategy
 * Ties **share** rank and **skip** subsequent ranks (standard competition ranking,
 * also called "1224" ranking). For example, if two members both have the
 * highest XP they both receive rank 1, and the next member receives rank 3.
 *
 * ## Anti-cheat / authoritative data notice
 * Leaderboard documents in Firestore are **denormalized and server-written**.
 * Cloud Functions aggregate and write `LeaderboardEntry[]` atomically; the client
 * MUST NOT write leaderboard data directly. The `rankEntries` helper here is
 * intended only for local sorting of data already fetched from Firestore (e.g.
 * when paginating results that arrive out-of-order, or for preview UIs).
 *
 * No state; all functions are pure.
 */

import { LeaderboardEntry } from '@forge/shared';

/** Minimal input shape accepted by {@link rankEntries}. */
export interface RankInput {
  uid: string;
  xp: number;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Sorts a list of entries by XP descending and assigns 1-based ranks.
 *
 * Ties share rank and skip the next rank(s) ("1224" / standard competition ranking).
 *
 * @param entries - Unranked member XP data.
 * @returns A new array of {@link LeaderboardEntry} objects sorted by XP descending,
 *          with `rank` assigned according to the tie-breaking strategy above.
 */
export function rankEntries(entries: RankInput[]): LeaderboardEntry[] {
  if (entries.length === 0) {
    return [];
  }

  // Sort descending by XP; for equal XP, preserve original order (stable sort).
  const sorted = [...entries].sort((a, b) => b.xp - a.xp);

  const ranked: LeaderboardEntry[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];

    // Assign the current rank to tied entries.
    // currentRank is already advanced past all previous ties.
    ranked.push({
      uid: entry.uid,
      xp: entry.xp,
      rank: currentRank,
      ...(entry.displayName !== undefined ? { displayName: entry.displayName } : {}),
      ...(entry.avatarUrl !== undefined ? { avatarUrl: entry.avatarUrl } : {}),
    });

    // Look ahead: if the next entry has a different XP, advance the rank counter
    // past the current tied block (rank = position of the next distinct entry).
    const nextEntry = sorted[i + 1];
    if (nextEntry === undefined || nextEntry.xp !== entry.xp) {
      // Position of the next item (1-based) = i + 2
      currentRank = i + 2;
    }
    // If the next entry ties, currentRank stays the same.
  }

  return ranked;
}
