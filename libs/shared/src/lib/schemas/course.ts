import { z } from 'zod';
import { CONTENT_TYPES, PUBLISH_STATUSES } from '../constants';
import { auditable, count, docId, idempotencyKey, storageRef, tenantId, uid } from './primitives';

/** /tenants/{tenantId}/courses/{courseId} */
export const course = auditable.extend({
  id: docId,
  tenantId,
  title: z.string().min(1).max(300),
  description: z.string().max(5000).default(''),
  status: z.enum(PUBLISH_STATUSES).default('draft'),
  tags: z.array(z.string()).default([]),
  /** Badge ids awarded on course completion. */
  badgeRefs: z.array(docId).default([]),
  xpReward: count.default(0),
  /** Optional: course shared from the global library (superadmin authored). */
  sourceLibraryId: docId.optional(),
});
export type Course = z.infer<typeof course>;

/** /tenants/{tenantId}/courses/{courseId}/modules/{moduleId} */
export const module = auditable.extend({
  id: docId,
  courseId: docId,
  tenantId,
  title: z.string().min(1).max(300),
  order: count,
  contentType: z.enum(CONTENT_TYPES),
  /** Storage reference or external URL for the content asset. */
  assetRef: storageRef.optional(),
  externalUrl: z.string().url().optional(),
  xpReward: count.default(0),
  badgeRefs: z.array(docId).default([]),
  /** Completion criteria, e.g. minimum score or watch percentage. */
  completion: z
    .object({
      minScore: z.number().min(0).max(100).optional(),
      minProgressPct: z.number().min(0).max(100).optional(),
    })
    .default({}),
});
export type Module = z.infer<typeof module>;

/** /tenants/{tenantId}/courses/{courseId}/enrollments/{uid} */
export const enrollment = auditable.extend({
  uid,
  courseId: docId,
  tenantId,
  progressPct: z.number().min(0).max(100).default(0),
  completed: z.boolean().default(false),
  score: z.number().min(0).max(100).optional(),
  lastActivityAt: z.string().datetime({ offset: true }).optional(),
  /** SCORM/cmi5 runtime state, persisted per enrollment. */
  cmi: z.record(z.string(), z.unknown()).optional(),
  /** Monotonic guard: the highest applied event `clientSeq`. */
  progressVersion: count.default(0),
  /** Lesson ids completed so far (server-derived projection). */
  completedLessonIds: z.array(docId).default([]),
  /** Number of scored attempts recorded. */
  attemptCount: count.default(0),
  /** Idempotency key of the most recently applied event. */
  lastEventKey: idempotencyKey.optional(),
});
export type Enrollment = z.infer<typeof enrollment>;
