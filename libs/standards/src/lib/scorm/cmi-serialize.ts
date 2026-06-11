/**
 * Conversion helpers between the two shapes CMI data travels in:
 *
 * - **Flat maps** — what the SCORM runtime API speaks: dotted element names to
 *   string values, e.g. `{ 'cmi.core.score.raw': '87' }`. Numeric path
 *   segments address collection entries (`cmi.interactions.0.id`).
 * - **Nested records** — what Firestore documents and application code prefer:
 *   `{ cmi: { core: { score: { raw: '87' } } } }` with arrays for collections.
 */

/** Dotted SCORM element names mapped to their string values. */
export type FlatCmi = Record<string, string>;

const INDEX_SEGMENT = /^\d+$/;

/**
 * Flattens a nested CMI record into a dotted flat map. Scalar leaves are
 * string-coerced; `null`/`undefined` leaves are dropped. Top-level keys that
 * already contain dots (i.e. an already-flat map) pass through unchanged, so
 * `flattenCmi` is safe to call on either shape.
 */
export function flattenCmi(value: Record<string, unknown>, prefix = ''): FlatCmi {
  const out: FlatCmi = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child === null || child === undefined) continue;
    if (Array.isArray(child)) {
      child.forEach((item, index) => {
        if (item === null || item === undefined) return;
        if (typeof item === 'object') {
          Object.assign(out, flattenCmi(item as Record<string, unknown>, `${path}.${index}`));
        } else {
          out[`${path}.${index}`] = String(item);
        }
      });
    } else if (typeof child === 'object') {
      Object.assign(out, flattenCmi(child as Record<string, unknown>, path));
    } else {
      out[path] = String(child);
    }
  }
  return out;
}

/**
 * Rebuilds a nested record from a dotted flat map. Numeric path segments
 * become array indices, everything else becomes object keys.
 */
export function nestCmi(flat: FlatCmi): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const segments = key.split('.');
    let node: Record<string, unknown> | unknown[] = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      let child = Array.isArray(node) ? node[Number(segment)] : node[segment];
      if (child === null || typeof child !== 'object') {
        child = INDEX_SEGMENT.test(segments[i + 1]) ? [] : {};
        if (Array.isArray(node)) node[Number(segment)] = child;
        else node[segment] = child;
      }
      node = child as Record<string, unknown> | unknown[];
    }
    const leaf = segments[segments.length - 1];
    if (Array.isArray(node)) node[Number(leaf)] = value;
    else node[leaf] = value;
  }
  return root;
}

/**
 * Deep-merges two nested CMI records without mutating either: records merge
 * key-by-key, arrays merge element-by-element (the overlay wins per index and
 * may extend the array), and scalars from the overlay replace the base.
 */
export function mergeCmi(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, incoming] of Object.entries(overlay)) {
    out[key] = mergeValue(out[key], incoming);
  }
  return out;
}

function mergeValue(current: unknown, incoming: unknown): unknown {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const merged = [...current];
    incoming.forEach((item, index) => {
      merged[index] = mergeValue(merged[index], item);
    });
    return merged;
  }
  if (isRecord(current) && isRecord(incoming)) {
    return mergeCmi(current, incoming);
  }
  return incoming;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
