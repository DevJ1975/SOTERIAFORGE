import { z } from 'zod';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Parse data against a schema, throwing a typed ValidationError on failure.
 * Use at every trust boundary (Firestore reads, function inputs, webhook bodies).
 *
 * Generic is keyed off the schema so the zod *output* type (post defaults /
 * transforms) is preserved.
 */
export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  context = 'payload',
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      `Invalid ${context}: ${result.error.issues.map((i) => i.message).join('; ')}`,
      result.error.issues,
    );
  }
  return result.data;
}

/** Safe parse returning a discriminated result (no throw). */
export function tryParse<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
): { ok: true; value: z.infer<S> } | { ok: false; issues: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, issues: result.error.issues };
}
