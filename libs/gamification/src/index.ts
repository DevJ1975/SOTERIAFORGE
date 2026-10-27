/**
 * @assurance/gamification — public API barrel
 *
 * This library provides client-side gamification helpers for XP, levels,
 * streaks, and leaderboard ranking.
 *
 * ## Anti-cheat guarantee
 * - XP grants are **server-authoritative**: the Forge API validates every
 *   XP-granting event before storing it.
 * - {@link XpService} is **optimistic/local only** — it lets the UI respond
 *   instantly, but authoritative server values overwrite it on the next sync.
 * - Leaderboards are **computed and served by the API**; clients
 *   MUST NOT write leaderboard data directly.
 * - {@link rankEntries} is a read-only sorting helper for already-fetched data.
 */

export * from './lib/leveling';
export * from './lib/streaks';
export * from './lib/leaderboard';
export * from './lib/xp.service';
export { XpBadgeComponent } from './lib/xp-badge.component';
