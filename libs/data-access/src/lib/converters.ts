import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from '@angular/fire/firestore';
import { parseOrThrow } from '@assurance/shared';
import type { ZodType, ZodTypeDef } from 'zod';

/** A zod schema whose output is T, with any input type (defaults/transforms ok). */
export type SchemaOf<T> = ZodType<T, ZodTypeDef, unknown>;

/**
 * Build a type-safe Firestore converter backed by a zod schema. Data is
 * validated on read (defensive against drift / manual edits) and on write.
 * The document `id` is injected from the snapshot id when present in the schema.
 *
 * On single-document reads (`getById` / `watch`) a parse failure throws — those
 * paths are all-or-nothing by nature. For collection reads use
 * {@link safeParseSnapshot} so one bad/stale cached doc skips-and-logs rather
 * than blanking the whole list (MO-01).
 */
export function zodConverter<T extends { id?: string } & DocumentData>(
  schema: SchemaOf<T>,
  context = 'document',
): FirestoreDataConverter<T> {
  return {
    toFirestore(model: T): DocumentData {
      const validated = parseOrThrow(schema, model, context);
      // Never persist the synthetic id field into the document body.
      const { id: _omit, ...rest } = validated as T & { id?: string };
      return rest as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): T {
      const data = snapshot.data(options);
      return parseOrThrow(schema, { ...data, id: snapshot.id }, context);
    },
  };
}

/**
 * Defensively parse a single query snapshot against `schema`, returning `null`
 * (and logging once) when the document fails validation instead of throwing.
 *
 * Used by collection reads so a single legacy/malformed/stale-cached document
 * cannot reject the whole `list()` emission and blank a screen. Single-doc reads
 * keep using the strict {@link zodConverter} so drift is still surfaced loudly.
 */
export function safeParseSnapshot<T extends { id?: string } & DocumentData>(
  schema: SchemaOf<T>,
  snapshot: QueryDocumentSnapshot,
  context = 'document',
  options?: SnapshotOptions,
): T | null {
  const data = snapshot.data(options);
  const result = schema.safeParse({ ...data, id: snapshot.id });
  if (result.success) {
    return result.data;
  }
  // Skip-and-log: do not throw — a bad cached/legacy doc must not blank the list.
  console.warn(
    `[converters] Skipping invalid ${context} "${snapshot.id}" in list read:`,
    result.error.issues,
  );
  return null;
}
