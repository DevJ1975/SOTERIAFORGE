import type { Module } from '@assurance/shared';
import { computeCourseProgress, isModuleComplete, nextIncompleteModule } from './progress';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-05-29T00:00:00.000Z';

function makeModule(
  id: string,
  order: number,
  completion: { minScore?: number; minProgressPct?: number } = {},
): Module {
  return {
    id,
    courseId: 'course-1',
    tenantId: 'acme',
    title: `Module ${id}`,
    order,
    contentType: 'video',
    xpReward: 0,
    badgeRefs: [],
    completion,
    createdAt: NOW,
  };
}

// ---------------------------------------------------------------------------
// computeCourseProgress
// ---------------------------------------------------------------------------

describe('computeCourseProgress', () => {
  it('returns 0 when there are no modules', () => {
    expect(computeCourseProgress([], [])).toBe(0);
  });

  it('returns 0 when no modules are completed', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2)];
    expect(computeCourseProgress(modules, [])).toBe(0);
  });

  it('returns 100 when all modules are completed', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2)];
    expect(computeCourseProgress(modules, ['m1', 'm2'])).toBe(100);
  });

  it('returns 50 when half of modules are completed', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2)];
    expect(computeCourseProgress(modules, ['m1'])).toBe(50);
  });

  it('rounds to nearest integer', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2), makeModule('m3', 3)];
    // 1/3 ≈ 33.33 → 33
    expect(computeCourseProgress(modules, ['m1'])).toBe(33);
    // 2/3 ≈ 66.67 → 67
    expect(computeCourseProgress(modules, ['m1', 'm2'])).toBe(67);
  });

  it('ignores completedModuleIds that are not in the modules list', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2)];
    expect(computeCourseProgress(modules, ['m1', 'ghost'])).toBe(50);
  });

  it('handles duplicate completedModuleIds gracefully', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2)];
    expect(computeCourseProgress(modules, ['m1', 'm1'])).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// isModuleComplete
// ---------------------------------------------------------------------------

describe('isModuleComplete', () => {
  describe('no completion criteria', () => {
    it('returns true regardless of evidence when neither criterion is set', () => {
      const m = makeModule('m1', 1, {});
      expect(isModuleComplete(m, {})).toBe(true);
      expect(isModuleComplete(m, { score: 0, progressPct: 0 })).toBe(true);
    });
  });

  describe('minScore only', () => {
    const m = makeModule('m1', 1, { minScore: 70 });

    it('returns false when score is missing', () => {
      expect(isModuleComplete(m, {})).toBe(false);
    });

    it('returns false when score is below threshold', () => {
      expect(isModuleComplete(m, { score: 69 })).toBe(false);
    });

    it('returns true when score exactly meets threshold', () => {
      expect(isModuleComplete(m, { score: 70 })).toBe(true);
    });

    it('returns true when score exceeds threshold', () => {
      expect(isModuleComplete(m, { score: 100 })).toBe(true);
    });
  });

  describe('minProgressPct only', () => {
    const m = makeModule('m1', 1, { minProgressPct: 80 });

    it('returns false when progressPct is missing', () => {
      expect(isModuleComplete(m, {})).toBe(false);
    });

    it('returns false when progressPct is below threshold', () => {
      expect(isModuleComplete(m, { progressPct: 79 })).toBe(false);
    });

    it('returns true when progressPct exactly meets threshold', () => {
      expect(isModuleComplete(m, { progressPct: 80 })).toBe(true);
    });

    it('returns true when progressPct exceeds threshold', () => {
      expect(isModuleComplete(m, { progressPct: 100 })).toBe(true);
    });
  });

  describe('both minScore and minProgressPct', () => {
    const m = makeModule('m1', 1, { minScore: 70, minProgressPct: 80 });

    it('returns false when both are missing', () => {
      expect(isModuleComplete(m, {})).toBe(false);
    });

    it('returns false when only score is satisfied', () => {
      expect(isModuleComplete(m, { score: 70 })).toBe(false);
    });

    it('returns false when only progressPct is satisfied', () => {
      expect(isModuleComplete(m, { progressPct: 80 })).toBe(false);
    });

    it('returns false when score fails even though progressPct passes', () => {
      expect(isModuleComplete(m, { score: 60, progressPct: 80 })).toBe(false);
    });

    it('returns false when progressPct fails even though score passes', () => {
      expect(isModuleComplete(m, { score: 70, progressPct: 70 })).toBe(false);
    });

    it('returns true when both criteria are met exactly', () => {
      expect(isModuleComplete(m, { score: 70, progressPct: 80 })).toBe(true);
    });

    it('returns true when both criteria are exceeded', () => {
      expect(isModuleComplete(m, { score: 95, progressPct: 100 })).toBe(true);
    });
  });

  describe('edge values', () => {
    it('treats score of 0 as failing a minScore of 1', () => {
      const m = makeModule('m1', 1, { minScore: 1 });
      expect(isModuleComplete(m, { score: 0 })).toBe(false);
    });

    it('treats score of 0 meeting a minScore of 0', () => {
      const m = makeModule('m1', 1, { minScore: 0 });
      expect(isModuleComplete(m, { score: 0 })).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// nextIncompleteModule
// ---------------------------------------------------------------------------

describe('nextIncompleteModule', () => {
  it('returns null for an empty module list', () => {
    expect(nextIncompleteModule([], [])).toBeNull();
  });

  it('returns null when all modules are completed', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2)];
    expect(nextIncompleteModule(modules, ['m1', 'm2'])).toBeNull();
  });

  it('returns the only incomplete module', () => {
    const modules = [makeModule('m1', 1), makeModule('m2', 2)];
    expect(nextIncompleteModule(modules, ['m1'])).toEqual(modules[1]);
  });

  it('returns the first module (lowest order) when none are completed', () => {
    const modules = [makeModule('m3', 3), makeModule('m1', 1), makeModule('m2', 2)];
    const result = nextIncompleteModule(modules, []);
    expect(result?.id).toBe('m1');
  });

  it('respects order when skipping completed modules', () => {
    const modules = [
      makeModule('m1', 1),
      makeModule('m2', 2),
      makeModule('m3', 3),
      makeModule('m4', 4),
    ];
    // m1 and m3 completed — next should be m2 (order 2)
    const result = nextIncompleteModule(modules, ['m1', 'm3']);
    expect(result?.id).toBe('m2');
  });

  it('handles modules provided in non-sequential order and sorts by order', () => {
    const modules = [makeModule('m-b', 20), makeModule('m-a', 10), makeModule('m-c', 30)];
    const result = nextIncompleteModule(modules, []);
    expect(result?.id).toBe('m-a');
  });

  it('does not mutate the original modules array', () => {
    const modules = [makeModule('m2', 2), makeModule('m1', 1)];
    const original = [...modules];
    nextIncompleteModule(modules, []);
    expect(modules).toEqual(original);
  });
});
