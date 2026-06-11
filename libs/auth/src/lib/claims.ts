import { customClaims, CustomClaims } from '@forge/shared';

/**
 * Parses raw ID-token claims into the platform's {@link CustomClaims} shape.
 *
 * Pure and side-effect free so it can be unit-tested without the Firebase SDK.
 * Any parse failure (missing role, tenant-scoped role without a tenantId,
 * malformed input) yields `null`: the user stays signed in but unprivileged.
 */
export function parseClaims(tokenClaims: unknown): CustomClaims | null {
  const parsed = customClaims.safeParse(tokenClaims);
  return parsed.success ? parsed.data : null;
}
