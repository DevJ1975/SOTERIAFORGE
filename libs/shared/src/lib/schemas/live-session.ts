import { z } from 'zod';
import { LIVE_SESSION_STATUSES, LIVE_SESSION_TYPES } from '../constants';
import { auditable, count, docId, isoDateTime, tenantId, uid } from './primitives';

/**
 * A live (Zoom) session, learner-readable.
 * /tenants/{tenantId}/liveSessions/{sessionId}
 *
 * The host `start_url` is sensitive and is NEVER on this document — it lives in
 * the authoring-only private subdoc /tenants/{t}/liveSessions/{id}/private/host
 * and is returned only by the `getHostStartUrl` callable. There is deliberately
 * no `startUrl` field here.
 */
export const liveSession = auditable.extend({
  id: docId,
  tenantId,
  /** Optional: the course this session belongs to. */
  courseId: docId.optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).default(''),
  type: z.enum(LIVE_SESSION_TYPES).default('meeting'),
  status: z.enum(LIVE_SESSION_STATUSES).default('scheduled'),
  scheduledStart: isoDateTime,
  durationMin: count,
  hostUid: uid,
  /** Zoom meeting/webinar id (assigned on creation). */
  meetingId: z.string().optional(),
  /** Learner-facing join link. */
  joinUrl: z.string().url().optional(),
  passcode: z.string().optional(),
  /** Surfaced after `recording.completed`. */
  recordingUrl: z.string().url().optional(),
  recordingId: z.string().optional(),
});
export type LiveSession = z.infer<typeof liveSession>;
