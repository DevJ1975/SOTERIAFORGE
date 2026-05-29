import { z } from 'zod';
import { LEADERBOARD_PERIODS } from '../constants';
import { auditable, count, docId, tenantId, uid } from './primitives';

/**
 * Open Badges 3.0 / 1EdTech Verifiable Credential metadata.
 * /tenants/{tenantId}/badges/{badgeId}
 */
export const badge = auditable.extend({
  id: docId,
  tenantId,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  imageUrl: z.string().url().optional(),
  /** Human-readable criteria narrative (Open Badges `criteria`). */
  criteria: z.string().max(2000).default(''),
  /** Issuer profile id (resolves to the tenant or platform issuer). */
  issuerId: z.string().optional(),
});
export type Badge = z.infer<typeof badge>;

/** A leaderboard entry, denormalized for read performance. */
export const leaderboardEntry = z.object({
  uid,
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  xp: count,
  rank: count,
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntry>;

/** /tenants/{tenantId}/leaderboard/{period} */
export const leaderboard = auditable.extend({
  tenantId,
  period: z.enum(LEADERBOARD_PERIODS),
  entries: z.array(leaderboardEntry).default([]),
});
export type Leaderboard = z.infer<typeof leaderboard>;
