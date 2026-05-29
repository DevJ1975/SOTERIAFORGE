import { z } from 'zod';

/**
 * Shared primitive schemas. Timestamps are stored as Firestore Timestamps at rest
 * but validated here as ISO strings or epoch millis at the application boundary.
 */

export const isoDateTime = z.string().datetime({ offset: true });

/** Firestore document id constraints. */
export const docId = z
  .string()
  .min(1)
  .max(1500)
  .regex(/^[^/]+$/, 'Document ids may not contain "/"');

/** A tenant id: lowercase alphanumeric + hyphen, used in subdomains. */
export const tenantId = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Must be a valid DNS label (subdomain-safe)');

/** Firebase Auth uid. */
export const uid = z.string().min(1).max(128);

/** A Cloud Storage object reference (gs:// or bucket-relative path). */
export const storageRef = z.string().min(1);

/** A non-negative integer count. */
export const count = z.number().int().nonnegative();

/** Audit metadata embedded on most documents. */
export const auditable = z.object({
  createdAt: isoDateTime,
  createdBy: uid.optional(),
  updatedAt: isoDateTime.optional(),
  updatedBy: uid.optional(),
});
export type Auditable = z.infer<typeof auditable>;
