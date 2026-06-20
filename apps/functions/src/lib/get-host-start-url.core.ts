import { z } from 'zod';
import { canManageLiveSession, parseCaller } from './authz';
import { FunctionsDomainError } from './errors';
import type { CorePorts } from './ports';

const getHostStartUrlInput = z.object({
  sessionId: z.string().min(1).max(1500),
});
export type GetHostStartUrlInput = z.infer<typeof getHostStartUrlInput>;

export interface GetHostStartUrlResult {
  startUrl: string;
}

/**
 * Pure core: return the sensitive host `startUrl` from the authoring-only private
 * subdoc. Read-only (no audit). Authz: host/admin/instructor in the caller's
 * verified tenant. Throws `not-found` when the private doc or its startUrl is
 * missing.
 */
export async function getHostStartUrlCore(
  deps: CorePorts,
  caller: unknown,
  rawInput: unknown,
): Promise<GetHostStartUrlResult> {
  const callerClaims = parseCaller(caller);
  const tenantId = callerClaims?.tenantId;

  const decision = canManageLiveSession(callerClaims, tenantId ?? '');
  if (!decision.allowed) {
    throw new FunctionsDomainError('permission-denied', decision.reason ?? 'Not allowed');
  }
  if (!tenantId) {
    throw new FunctionsDomainError(
      'permission-denied',
      'Caller must be a tenant-scoped host with a tenantId',
    );
  }

  const parsed = getHostStartUrlInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new FunctionsDomainError(
      'invalid-argument',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const { sessionId } = parsed.data;

  const priv = await deps.db.getLiveSessionPrivate(tenantId, sessionId);
  const startUrl = priv && typeof priv['startUrl'] === 'string' ? priv['startUrl'] : undefined;
  if (!startUrl) {
    throw new FunctionsDomainError(
      'not-found',
      `No host start URL for live session '${sessionId}'`,
    );
  }

  return { startUrl };
}
