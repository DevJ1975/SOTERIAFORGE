/**
 * Pure, generic undo/redo stack built on structural snapshots.
 *
 * The store pushes the *current* state before applying a mutation; `undo`
 * exchanges the present for the most recent snapshot, `redo` walks forward
 * again. Snapshots are deep-cloned both on the way in and on the way out so
 * callers can never alias history entries.
 */

/** structuredClone with a JSON fallback for environments that lack it (e.g. older jsdom). */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly capacity = 100) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Number of undoable snapshots currently held. */
  get size(): number {
    return this.past.length;
  }

  /** Record the state as it was *before* a mutation. Clears the redo stack. */
  push(snapshot: T): void {
    this.past.push(deepClone(snapshot));
    if (this.past.length > this.capacity) {
      this.past.shift();
    }
    this.future = [];
  }

  /** Returns the previous snapshot (or undefined), banking `current` for redo. */
  undo(current: T): T | undefined {
    const snapshot = this.past.pop();
    if (snapshot === undefined) return undefined;
    this.future.push(deepClone(current));
    return deepClone(snapshot);
  }

  /** Returns the next snapshot (or undefined), banking `current` for undo. */
  redo(current: T): T | undefined {
    const snapshot = this.future.pop();
    if (snapshot === undefined) return undefined;
    this.past.push(deepClone(current));
    return deepClone(snapshot);
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
