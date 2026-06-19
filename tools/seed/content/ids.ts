/**
 * Deterministic id helper for seed content.
 *
 * The emulator seed must be idempotent: re-running it must overwrite the same
 * documents, never create duplicates. So every block, lesson, and option id is
 * a stable string derived from its course/lesson/sequence position rather than
 * a random uuid. `bid('ramp', 'l1', 'b3')` -> `ramp-l1-b3`.
 */
export function bid(...parts: string[]): string {
  return parts.join('-');
}

/** Fixed authoring timestamp so re-seeds produce byte-identical docs. */
export const SEED_TIMESTAMP = '2026-01-05T09:00:00.000Z';
