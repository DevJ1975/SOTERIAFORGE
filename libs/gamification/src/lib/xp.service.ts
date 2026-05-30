import { Injectable } from '@angular/core';
import { Member } from '@assurance/shared';
import { levelForXp } from './leveling';
import { updateStreak } from './streaks';

/**
 * Client-side XP service for optimistic/local gamification updates.
 *
 * ## Anti-cheat notice
 * This service performs **optimistic local computation only**.
 * It MUST NOT be used as the authoritative source for XP grants.
 *
 * All XP-granting events (course completions, quiz passes, etc.) are validated
 * **server-side** by Cloud Functions before any Firestore writes occur. The server:
 *   - Verifies the event source and its integrity.
 *   - Applies rate limiting and duplicate-event detection.
 *   - Writes the canonical `xp`, `level`, and `streakDays` values to Firestore.
 *
 * The client uses this service only to show a responsive UI before the server
 * confirms. On the next data sync the authoritative server values overwrite the
 * optimistic state automatically.
 */
@Injectable({ providedIn: 'root' })
export class XpService {
  /**
   * Returns a **new** Member object with XP, level, streak, and lastActiveAt
   * updated optimistically.
   *
   * Does NOT mutate `member`. Does NOT write to any backend.
   *
   * @param member  - The current member snapshot.
   * @param amount  - XP to award (must be a non-negative integer).
   * @param nowISO  - ISO 8601 timestamp representing "now" (caller-supplied so
   *                  this function stays pure/testable).
   * @returns A new Member with updated gamification fields.
   */
  awardXp(member: Member, amount: number, nowISO: string): Member {
    if (amount < 0) {
      throw new RangeError(`XP amount must be non-negative, got ${amount}`);
    }

    const newXp = member.xp + amount;
    const { level: newLevel } = levelForXp(newXp);

    const { streakDays: newStreakDays } = updateStreak(
      member.lastActiveAt,
      nowISO,
      member.streakDays,
    );

    return {
      ...member,
      xp: newXp,
      level: newLevel,
      streakDays: newStreakDays,
      lastActiveAt: nowISO,
      updatedAt: nowISO,
    };
  }
}
