import { z } from 'zod';

/**
 * Badge award + platform badge catalog used by the badge wall.
 *
 * NOTE(unify-later): `awardSchema` mirrors the `badgeAward` contract the
 * concurrent backend gamification agent is adding to @forge/shared
 * (/tenants/{t}/members/{uid}/awards/{badgeId}), and PLATFORM_BADGE_INFO
 * mirrors its platform badge catalog. Once both agents land, replace these
 * local copies with the @forge/shared exports.
 */

/** /tenants/{tenantId}/members/{uid}/awards/{badgeId} */
export const awardSchema = z.object({
  badgeId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  /** ISO datetime (Firestore Timestamps are converted before parsing). */
  earnedAt: z.string().min(1),
  /** Open Badges 3.0 verifiable credential payload (opaque to the UI). */
  credential: z.unknown().optional(),
});
export type BadgeAward = z.infer<typeof awardSchema>;

/** Static descriptor of a platform badge (used for "locked" display). */
export interface PlatformBadgeInfo {
  id: string;
  name: string;
  /** Criteria narrative shown on locked tiles. */
  description: string;
}

/** The built-in platform badges, in display order. */
export const PLATFORM_BADGE_INFO: readonly PlatformBadgeInfo[] = [
  { id: 'first-steps', name: 'First Steps', description: 'Complete your first course' },
  { id: 'course-crusher', name: 'Course Crusher', description: 'Complete 5 courses' },
  { id: 'on-fire', name: 'On Fire', description: '7-day learning streak' },
  { id: 'sharpshooter', name: 'Sharpshooter', description: 'Finish a course with a 95%+ score' },
  {
    id: 'arcade-initiate',
    name: 'Arcade Initiate',
    description: 'Play your first Safety Arcade game',
  },
  { id: 'high-roller', name: 'High Roller', description: 'Win a round of PERIL!' },
];

/** One tile on the badge wall: a platform badge merged with the earned state. */
export interface BadgeTile {
  id: string;
  name: string;
  /** Criteria narrative (locked) or award description (earned). */
  description: string;
  earned: boolean;
  /** ISO datetime, present exactly when earned. */
  earnedAt?: string;
}

/**
 * Merges the member's awards onto the platform badge catalog: every platform
 * badge appears (locked when un-earned, in catalog order); awards for badges
 * outside the catalog (tenant-custom) are appended as earned tiles.
 */
export function mergeBadgeWall(
  awards: readonly BadgeAward[],
  catalog: readonly PlatformBadgeInfo[] = PLATFORM_BADGE_INFO,
): BadgeTile[] {
  const byId = new Map(awards.map((award) => [award.badgeId, award]));
  const tiles: BadgeTile[] = catalog.map((badge) => {
    const award = byId.get(badge.id);
    return award
      ? {
          id: badge.id,
          name: award.name || badge.name,
          description: award.description || badge.description,
          earned: true,
          earnedAt: award.earnedAt,
        }
      : { id: badge.id, name: badge.name, description: badge.description, earned: false };
  });
  const catalogIds = new Set(catalog.map((badge) => badge.id));
  for (const award of awards) {
    if (catalogIds.has(award.badgeId)) continue;
    tiles.push({
      id: award.badgeId,
      name: award.name,
      description: award.description,
      earned: true,
      earnedAt: award.earnedAt,
    });
  }
  return tiles;
}
