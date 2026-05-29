import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { Course, Enrollment, Module } from '@forge/shared';
import { CourseRepository, EnrollmentRepository } from '@forge/data-access';
import { computeCourseProgress, nextIncompleteModule } from './progress';

export interface CourseStoreState {
  tenantId: string;
  courseId: string;
  course: Course | null;
  modules: Module[];
  enrollment: Enrollment | null;
  loading: boolean;
}

const initialState: CourseStoreState = {
  tenantId: '',
  courseId: '',
  course: null,
  modules: [],
  enrollment: null,
  loading: false,
};

/**
 * NgRx SignalStore for a single course context.
 *
 * Consumers must call `load(tenantId, courseId, uid)` after injection to
 * populate the store. Computed signals update reactively as state changes.
 *
 * Provide per-component (not root) so each course view gets its own isolated
 * store instance. Modules can be externally patched after load if a
 * ModuleRepository is added to @forge/data-access in the future.
 */
export const CourseStore = signalStore(
  withState<CourseStoreState>(initialState),

  withComputed((store) => ({
    /** Percentage of modules completed (0–100). */
    progressPct: computed(() =>
      computeCourseProgress(
        store.modules(),
        completedIdsFromEnrollment(store.enrollment(), store.modules()),
      ),
    ),

    /** Next module the learner should work on. */
    nextModule: computed(() =>
      nextIncompleteModule(
        store.modules(),
        completedIdsFromEnrollment(store.enrollment(), store.modules()),
      ),
    ),

    /** True when all modules are completed (derived from enrollment flag). */
    isComplete: computed(() => store.enrollment()?.completed ?? false),
  })),

  withMethods((store) => {
    const courseRepo = inject(CourseRepository);
    const enrollmentRepo = inject(EnrollmentRepository);

    return {
      /**
       * Loads the course and the user's enrollment in parallel.
       * Modules are not loaded here because CourseRepository does not expose a
       * modules sub-collection. Patch modules externally after obtaining them
       * from a resolver or a dedicated ModuleRepository.
       */
      async load(tenantId: string, courseId: string, uid: string): Promise<void> {
        patchState(store, { loading: true, tenantId, courseId });

        try {
          const [course, enrollment] = await Promise.all([
            courseRepo.getById(tenantId, courseId),
            enrollmentRepo.get(tenantId, courseId, uid),
          ]);

          patchState(store, { course, enrollment, loading: false });
        } catch {
          patchState(store, { loading: false });
        }
      },

      /** Refreshes only the enrollment (e.g. after a module-complete event). */
      async refreshEnrollment(uid: string): Promise<void> {
        const tenantId = store.tenantId();
        const courseId = store.courseId();
        if (!tenantId || !courseId) return;

        const enrollment = await enrollmentRepo.get(tenantId, courseId, uid);
        patchState(store, { enrollment });
      },

      /**
       * Allows external callers (e.g. route resolvers) to supply the module
       * list once it has been fetched independently.
       */
      setModules(modules: Module[]): void {
        patchState(store, { modules });
      },
    };
  }),
);

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Derives the list of completed module ids from an enrollment's stored
 * progress. Completed module ids are stored inside `enrollment.cmi` under the
 * key `completedModuleIds` as a string array (kept general-purpose via cmi).
 *
 * Fallback: if `enrollment.completed` is true and no explicit list is stored,
 * all module ids are returned (covers legacy / externally written enrollments).
 */
function completedIdsFromEnrollment(enrollment: Enrollment | null, modules: Module[]): string[] {
  if (!enrollment) return [];

  // Prefer explicit CMI-stored list
  const raw = enrollment.cmi?.['completedModuleIds'];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string');
  }

  // Fallback: enrollment is 100 % complete — treat all modules as done
  if (enrollment.completed) {
    return modules.map((m) => m.id);
  }

  return [];
}
