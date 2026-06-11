import { z } from 'zod';
import { docId, tenantId as tenantIdSchema, uid as uidSchema } from '@forge/shared';
import type { GamificationDbPort } from './ports';

/**
 * Pure core + thin HTTP handler for public badge verification:
 *
 *   GET /verifyBadge?tenant={tenantId}&uid={uid}&badge={badgeId}
 *
 * Returns the stored Open Badges 3.0 verifiable credential as JSON. Public by
 * design (credential URLs are shared with third-party verifiers — no auth),
 * with cache headers since awards are immutable once issued. The credential is
 * currently unsigned; cryptographic proof arrives with production issuer keys.
 *
 * main.ts wires this as: onRequest(..., createVerifyBadgeHandler(deps)).
 */

const verifyBadgeQuery = z.object({
  tenant: tenantIdSchema,
  uid: uidSchema,
  badge: docId,
});

export interface VerifyBadgeHit {
  found: true;
  badgeId: string;
  name?: string;
  description?: string;
  earnedAt?: string;
  credential: Record<string, unknown>;
}

export interface VerifyBadgeMiss {
  found: false;
}

export type VerifyBadgeResult = VerifyBadgeHit | VerifyBadgeMiss;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Look up a stored badge credential. Pure I/O via the port — no HTTP types. */
export async function verifyBadgeCore(
  deps: { db: GamificationDbPort },
  params: { tenantId: string; uid: string; badgeId: string },
): Promise<VerifyBadgeResult> {
  const award = await deps.db.getAward(params.tenantId, params.uid, params.badgeId);
  if (!award || !isRecord(award['credential'])) {
    return { found: false };
  }
  return {
    found: true,
    badgeId: params.badgeId,
    ...(typeof award['name'] === 'string' ? { name: award['name'] } : {}),
    ...(typeof award['description'] === 'string' ? { description: award['description'] } : {}),
    ...(typeof award['earnedAt'] === 'string' ? { earnedAt: award['earnedAt'] } : {}),
    credential: award['credential'],
  };
}

/**
 * Structural request/response types so the handler stays framework-free and
 * unit-testable; firebase-functions' Request/Response satisfy them.
 */
export interface VerifyBadgeRequest {
  method: string;
  query: Record<string, unknown>;
}

export interface VerifyBadgeResponse {
  set(name: string, value: string): unknown;
  status(code: number): unknown;
  json(body: unknown): unknown;
}

/** Found credentials are immutable: cache generously at the edge. */
const CACHE_CONTROL_HIT = 'public, max-age=300, s-maxage=86400';
/** Misses may flip to hits the moment a badge is earned: cache briefly. */
const CACHE_CONTROL_MISS = 'public, max-age=60';

/** Build the GET /verifyBadge request handler over the gamification port. */
export function createVerifyBadgeHandler(deps: { db: GamificationDbPort }) {
  return async (req: VerifyBadgeRequest, res: VerifyBadgeResponse): Promise<void> => {
    if (req.method !== 'GET') {
      res.set('Allow', 'GET');
      res.status(405);
      res.json({ error: 'method-not-allowed' });
      return;
    }
    const parsed = verifyBadgeQuery.safeParse({
      tenant: req.query['tenant'],
      uid: req.query['uid'],
      badge: req.query['badge'],
    });
    if (!parsed.success) {
      res.set('Cache-Control', CACHE_CONTROL_MISS);
      res.status(400);
      res.json({ error: 'invalid-argument', detail: 'tenant, uid and badge are required' });
      return;
    }
    const result = await verifyBadgeCore(deps, {
      tenantId: parsed.data.tenant,
      uid: parsed.data.uid,
      badgeId: parsed.data.badge,
    });
    if (!result.found) {
      res.set('Cache-Control', CACHE_CONTROL_MISS);
      res.status(404);
      res.json({ error: 'not-found' });
      return;
    }
    res.set('Cache-Control', CACHE_CONTROL_HIT);
    res.status(200);
    res.json(result);
  };
}
