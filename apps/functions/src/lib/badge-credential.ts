import { platformBadgeById } from '@forge/shared';
import type { PlatformBadgeId } from '@forge/shared';
import type { GamificationDbPort } from './ports';

/**
 * Open Badges 3.0 / W3C Verifiable Credential builders for the platform
 * badges, plus the persistence helper the trigger cores share.
 *
 * Credentials are currently UNSIGNED (no `proof` block): cryptographic signing
 * arrives with the production issuer keys. Everything else follows the OB 3.0
 * VC shape so verifiers can already consume the JSON.
 */

const PLATFORM_ORIGIN = 'https://soteriaforge.com';

/** Build the OB 3.0 verifiable credential for one earned platform badge. */
export function buildBadgeCredential(
  tenantId: string,
  uid: string,
  badgeId: PlatformBadgeId,
  earnedAt: string,
): Record<string, unknown> {
  const badge = platformBadgeById(badgeId);
  if (!badge) {
    throw new Error(`Unknown platform badge id '${badgeId}'`);
  }
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: `${PLATFORM_ORIGIN}/badges/${tenantId}/${uid}/${badgeId}`,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: {
      id: `${PLATFORM_ORIGIN}/issuer/${tenantId}`,
      type: 'Profile',
      name: 'Soteria FORGE',
    },
    validFrom: earnedAt,
    name: badge.name,
    credentialSubject: {
      id: `${PLATFORM_ORIGIN}/users/${uid}`,
      type: ['AchievementSubject'],
      achievement: {
        id: `${PLATFORM_ORIGIN}/achievements/${badgeId}`,
        type: ['Achievement'],
        name: badge.name,
        description: badge.description,
        criteria: { narrative: badge.criteria },
      },
    },
  };
}

/** Build the award doc stored at /tenants/{t}/members/{uid}/awards/{badgeId}. */
export function buildBadgeAward(
  tenantId: string,
  uid: string,
  badgeId: PlatformBadgeId,
  earnedAt: string,
): Record<string, unknown> {
  const badge = platformBadgeById(badgeId);
  if (!badge) {
    throw new Error(`Unknown platform badge id '${badgeId}'`);
  }
  return {
    badgeId,
    name: badge.name,
    description: badge.description,
    earnedAt,
    credential: buildBadgeCredential(tenantId, uid, badgeId, earnedAt),
  };
}

/**
 * Persist newly earned badges, skipping any the member already holds (the
 * award doc is keyed by badgeId, so this makes badge grants exactly-once even
 * across duplicate trigger deliveries). Resolves the ids actually written.
 */
export async function persistEarnedBadges(
  db: GamificationDbPort,
  tenantId: string,
  uid: string,
  badgeIds: readonly PlatformBadgeId[],
  earnedAt: string,
): Promise<PlatformBadgeId[]> {
  const written: PlatformBadgeId[] = [];
  for (const badgeId of badgeIds) {
    const existing = await db.getAward(tenantId, uid, badgeId);
    if (existing) continue;
    await db.setAward(tenantId, uid, badgeId, buildBadgeAward(tenantId, uid, badgeId, earnedAt));
    written.push(badgeId);
  }
  return written;
}
