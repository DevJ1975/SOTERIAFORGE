/**
 * Generate a stable, collision-resistant id for authoring entities (courses,
 * lessons, blocks, nested items). Uses crypto.randomUUID when available and
 * falls back to a random base36 string elsewhere (older jsdom, SSR shims).
 */
export function createId(prefix = ''): string {
  const body =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
          .toString(36)
          .slice(2, 10)}`;
  return prefix ? `${prefix}-${body}` : body;
}
