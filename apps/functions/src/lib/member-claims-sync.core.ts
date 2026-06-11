import { z } from 'zod';
import { customClaims } from '@forge/shared';
import type { AuthPort } from './ports';

/**
 * Pure core for the members onDocumentWritten trigger: keep custom claims in
 * sync with the member doc. Deactivated members get their claims cleared
 * (setCustomClaims(uid, null)); role changes rebuild claims. No-ops are skipped
 * to avoid useless writes / trigger feedback loops.
 */

const memberSnapshot = z.object({
  role: z.string().optional(),
  status: z.string().optional(),
});

function snapshotOf(value: unknown): z.infer<typeof memberSnapshot> | null {
  if (value === null || value === undefined) return null;
  const result = memberSnapshot.safeParse(value);
  return result.success ? result.data : null;
}

export interface MemberWriteEvent {
  tenantId: string;
  uid: string;
  before: unknown;
  after: unknown;
}

export type SyncAction = 'noop' | 'cleared' | 'updated' | 'skipped';

export async function syncMemberClaimsCore(
  deps: { auth: AuthPort },
  event: MemberWriteEvent,
): Promise<{ action: SyncAction }> {
  const before = snapshotOf(event.before);
  const after = snapshotOf(event.after);

  // Document deleted: clear claims (treat like deactivation).
  if (!after) {
    if (!before) return { action: 'noop' };
    await deps.auth.setCustomClaims(event.uid, null);
    return { action: 'cleared' };
  }

  const roleChanged = before?.role !== after.role;
  const statusChanged = before?.status !== after.status;
  if (!roleChanged && !statusChanged) {
    return { action: 'noop' };
  }

  if (after.status === 'deactivated') {
    // Already deactivated (e.g. role edited while deactivated): keep claims cleared.
    if (before?.status === 'deactivated') return { action: 'noop' };
    await deps.auth.setCustomClaims(event.uid, null);
    return { action: 'cleared' };
  }

  // Rebuild claims when the role changed, or on reactivation (claims were cleared).
  const reactivated = before?.status === 'deactivated';
  if (!roleChanged && !reactivated) {
    return { action: 'noop' };
  }

  const claims = customClaims.safeParse({
    role: after.role,
    tenantId: event.tenantId,
    entitlements: [],
  });
  if (!claims.success) {
    // Malformed member doc (e.g. unknown role): never write invalid claims.
    return { action: 'skipped' };
  }
  await deps.auth.setCustomClaims(event.uid, claims.data);
  return { action: 'updated' };
}
