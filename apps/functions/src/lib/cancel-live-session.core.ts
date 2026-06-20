import { z } from 'zod';
import { recordAuditEvent } from './audit-log';
import { canManageLiveSession, parseCaller } from './authz';
import { FunctionsDomainError } from './errors';
import type { CorePorts } from './ports';

const cancelLiveSessionInput = z.object({
  sessionId: z.string().min(1).max(1500),
});
export type CancelLiveSessionInput = z.infer<typeof cancelLiveSessionInput>;

export interface CancelLiveSessionResult {
  sessionId: string;
  status: 'canceled';
}

/**
 * Pure core: cancel a live session.
 *
 * Authz derives the tenant from the verified caller claims; the caller must be
 * the host or a manager (admin/instructor) in that tenant. The Zoom meeting is
 * deleted best-effort (a Zoom failure must not block the cancellation), then the
 * learner-readable doc is flipped to status 'canceled'.
 */
export async function cancelLiveSessionCore(
  deps: CorePorts,
  caller: unknown,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<CancelLiveSessionResult> {
  const callerClaims = parseCaller(caller);
  const tenantId = callerClaims?.tenantId;
  const hostUid = callerClaims?.uid;

  const decision = canManageLiveSession(callerClaims, tenantId ?? '');
  if (!decision.allowed) {
    throw new FunctionsDomainError('permission-denied', decision.reason ?? 'Not allowed');
  }
  if (!tenantId || !hostUid) {
    throw new FunctionsDomainError(
      'permission-denied',
      'Caller must be a tenant-scoped host with a tenantId and uid',
    );
  }

  const parsed = cancelLiveSessionInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new FunctionsDomainError(
      'invalid-argument',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const { sessionId } = parsed.data;

  const session = await deps.db.getLiveSession(tenantId, sessionId);
  if (!session) {
    throw new FunctionsDomainError('not-found', `Live session '${sessionId}' does not exist`);
  }

  // Best-effort Zoom cleanup; never block the cancellation on a Zoom failure.
  const meetingId = typeof session['meetingId'] === 'string' ? session['meetingId'] : undefined;
  if (deps.zoom && meetingId) {
    try {
      await deps.zoom.deleteMeeting(meetingId);
    } catch {
      // Swallow — the meeting may already be gone; cancellation proceeds.
    }
  }

  await deps.db.setLiveSession(tenantId, sessionId, {
    status: 'canceled',
    updatedAt: now.toISOString(),
    updatedBy: hostUid,
  });

  await recordAuditEvent(deps.audit, {
    actorUid: hostUid,
    actorRole: callerClaims?.role,
    tenantId,
    action: 'cancelLiveSession',
    target: sessionId,
    metadata: { meetingId },
  });

  return { sessionId, status: 'canceled' };
}
