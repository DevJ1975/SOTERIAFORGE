import { Timestamp } from 'firebase/firestore';
import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
} from 'firebase/firestore';
import type { z } from 'zod';

/**
 * Recursively converts Firestore `Timestamp` instances to ISO-8601 strings
 * (`timestamp.toDate().toISOString()`). Plain objects and arrays are walked;
 * all other values (strings included) are returned untouched, so data already
 * stored as ISO strings round-trips unchanged.
 */
export function timestampsToIso(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(timestampsToIso);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, timestampsToIso(entry)]),
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Builds a client-SDK {@link FirestoreDataConverter} backed by a zod schema.
 *
 * - `fromFirestore` converts any Firestore `Timestamp` values to ISO strings
 *   (the schemas type datetimes as ISO strings), then parses the document
 *   through the schema. On failure it throws with the document path in the
 *   message so the offending collection is identifiable.
 * - `toFirestore` validates (and applies schema defaults to) the model before
 *   it is written. ISO datetime strings are written as-is.
 */
export function zodConverter<S extends z.ZodType>(schema: S): FirestoreDataConverter<z.infer<S>> {
  return {
    toFirestore(model: WithFieldValue<z.infer<S>>): DocumentData {
      return schema.parse(model) as DocumentData;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot, options?: SnapshotOptions): z.infer<S> {
      const raw = timestampsToIso(snapshot.data(options));
      const result = schema.safeParse(raw);
      if (!result.success) {
        const path =
          (snapshot as { ref?: { path?: string } }).ref?.path ?? `<unknown>/${snapshot.id}`;
        throw new Error(
          `Firestore document "${path}" failed schema validation: ${result.error.message}`,
        );
      }
      return result.data as z.infer<S>;
    },
  };
}
