import { z } from 'zod';
import { CONTENT_TYPES, PUBLISH_STATUSES } from '../constants';
import { auditable, count, docId, storageRef, tenantId, uid } from './primitives';

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
  /**
   * Author opt-in (MO-07): when true, learners may download this course's
   * cacheable content (uploaded/same-origin media, Firebase Storage assets) for
   * offline use. Defaults to false so existing course docs validate unchanged.
   * Non-cacheable modules (YouTube/Vimeo/iframe) are surfaced as "requires
   * connection" in the learner UI rather than blocking the opt-in.
   */
  availableOffline: z.boolean().default(false),
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
  /**
   * SCORM specification version for `scorm` modules. Detected from the package's
   * imsmanifest.xml on upload (`scormPackages.scormVersion`) and copied here by
   * the authoring flow; the player defaults to '2004' when absent.
   */
  scormVersion: z.enum(['1.2', '2004']).optional(),
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
  /** True when an admin/instructor assigned this course (vs. self-enrolled). */
  assigned: z.boolean().optional(),
  assignedBy: uid.optional(),
  assignedAt: z.string().datetime({ offset: true }).optional(),
  /** Optional due date for assigned training. */
  dueAt: z.string().datetime({ offset: true }).optional(),
  /** SCORM/cmi5 runtime state, persisted per enrollment. */
  cmi: z.record(z.string(), z.unknown()).optional(),
});
export type Enrollment = z.infer<typeof enrollment>;
