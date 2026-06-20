import { z } from 'zod';
import { liveSession, LIVE_SESSION_TYPES } from '@forge/shared';
import { recordAuditEvent } from './audit-log';
import { canManageLiveSession, parseCaller } from './authz';
import { FunctionsDomainError } from './errors';
import type { CorePorts } from './ports';

const scheduleLiveSessionInput = z.object({
  courseId: z.string().min(1).max(1500).optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  type: z.enum(LIVE_SESSION_TYPES).optional(),
  scheduledStart: z.string().datetime({ offset: true }),
  durationMin: z.number().int().positive(),
});
export type ScheduleLiveSessionInput = z.infer<typeof scheduleLiveSessionInput>;

export interface ScheduleLiveSessionResult {
  sessionId: string;
  joinUrl?: string;
  status: 'scheduled';
}

/**
 * Generate an opaque, collision-resistant session id without pulling a uuid dep.
 * Time-prefixed + random suffix is plenty for a tenant-scoped doc id.
 */
function generateSessionId(now: Date): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ls-${now.getTime().toString(36)}-${rand}`;
}

/**
 * Pure core: schedule a Zoom live session.
 *
 * tenantId + hostUid come from the VERIFIED caller claims, never from request
 * data. Writes the learner-readable session doc (joinUrl/passcode, status
 * 'scheduled', NO startUrl) and the sensitive host startUrl into the private
 * subdoc. Throws `unavailable` when Zoom is not configured (`deps.zoom` null).
 */
export async function scheduleLiveSessionCore(
  deps: CorePorts,
  caller: unknown,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<ScheduleLiveSessionResult> {
  const callerClaims = parseCaller(caller);

  // tenantId + hostUid derive from verified claims only.
  const tenantId = callerClaims?.tenantId;
  const hostUid = callerClaims?.uid;

  const decision = canManageLiveSession(callerClaims, tenantId ?? '');
  if (!decision.allowed) {
    throw new FunctionsDomainError('permission-denied', decision.reason ?? 'Not allowed');
  }
  // Superadmin may pass authz but carries no single-tenant binding; a host
  // session needs a concrete tenant + host uid to attribute the doc.
  if (!tenantId || !hostUid) {
    throw new FunctionsDomainError(
      'permission-denied',
      'Caller must be a tenant-scoped host with a tenantId and uid',
    );
  }

  const parsed = scheduleLiveSessionInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new FunctionsDomainError(
      'invalid-argument',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const input = parsed.data;

  // Zoom must be configured (secrets present) to create a real meeting.
  if (!deps.zoom) {
    throw new FunctionsDomainError('unavailable', 'Zoom integration is not configured');
  }

  // Verify the course exists when one is referenced.
  if (input.courseId) {
    const course = await deps.db.getCourse(tenantId, input.courseId);
    if (!course) {
      throw new FunctionsDomainError('not-found', `Course '${input.courseId}' does not exist`);
    }
  }

  const type = input.type ?? 'meeting';
  const meeting = await deps.zoom.createMeeting({
    type,
    topic: input.title,
    startTime: input.scheduledStart,
    durationMin: input.durationMin,
    tenantId,
    hostUid,
  });

  const sessionId = generateSessionId(now);

  // The learner-readable doc — joinUrl/passcode but NEVER the startUrl. Validated
  // through the shared liveSession schema.
  const sessionDoc = liveSession.parse({
    id: sessionId,
    tenantId,
    ...(input.courseId ? { courseId: input.courseId } : {}),
    title: input.title,
    description: input.description ?? '',
    type,
    status: 'scheduled',
    scheduledStart: input.scheduledStart,
    durationMin: input.durationMin,
    hostUid,
    meetingId: meeting.meetingId,
    ...(meeting.joinUrl ? { joinUrl: meeting.joinUrl } : {}),
    ...(meeting.passcode ? { passcode: meeting.passcode } : {}),
    createdAt: now.toISOString(),
    createdBy: hostUid,
  });
  await deps.db.setLiveSession(tenantId, sessionId, sessionDoc);

  // The sensitive host start link lives ONLY in the authoring-only private subdoc.
  await deps.db.setLiveSessionPrivate(tenantId, sessionId, { startUrl: meeting.startUrl });

  // Best-effort, non-fatal audit trail.
  await recordAuditEvent(deps.audit, {
    actorUid: hostUid,
    actorRole: callerClaims?.role,
    tenantId,
    action: 'scheduleLiveSession',
    target: sessionId,
    metadata: { type, meetingId: meeting.meetingId, courseId: input.courseId },
  });

  return {
    sessionId,
    ...(meeting.joinUrl ? { joinUrl: meeting.joinUrl } : {}),
    status: 'scheduled',
  };
}
