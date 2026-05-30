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
