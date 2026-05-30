import type { Module } from '@assurance/shared';

/**
 * Pure progress-computation helpers.
 * No Angular dependencies — safe to use in any context (service, store, worker).
 */

/**
 * Computes overall course progress as a percentage (0–100, integer-rounded)
 * based on the ratio of completed modules to total modules.
 *
 * Returns 0 when there are no modules.
 */
export function computeCourseProgress(modules: Module[], completedModuleIds: string[]): number {
  if (modules.length === 0) return 0;
  const completedSet = new Set(completedModuleIds);
  const completedCount = modules.filter((m) => completedSet.has(m.id)).length;
  return Math.round((completedCount / modules.length) * 100);
}

/**
 * Determines whether a single module is complete given runtime evidence.
 *
 * Completion rules (all applicable criteria must pass):
 *  - If `module.completion.minScore` is set, `evidence.score` must be >= it.
 *  - If `module.completion.minProgressPct` is set, `evidence.progressPct` must be >= it.
 *  - If neither criterion is defined the module is considered complete (no gate).
 */
export function isModuleComplete(
  module: Module,
  evidence: { score?: number; progressPct?: number },
): boolean {
  const { minScore, minProgressPct } = module.completion;

  if (minScore !== undefined) {
    if (evidence.score === undefined || evidence.score < minScore) {
      return false;
    }
  }

  if (minProgressPct !== undefined) {
    if (evidence.progressPct === undefined || evidence.progressPct < minProgressPct) {
      return false;
    }
  }

  return true;
}

/**
 * Returns the first module (by ascending `order`) that is NOT in `completedIds`,
 * or `null` when all modules are complete (or the list is empty).
 */
export function nextIncompleteModule(modules: Module[], completedIds: string[]): Module | null {
  const completedSet = new Set(completedIds);
  const sorted = [...modules].sort((a, b) => a.order - b.order);
  return sorted.find((m) => !completedSet.has(m.id)) ?? null;
}
