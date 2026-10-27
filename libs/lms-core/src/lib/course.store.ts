import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  type ApiCourseOutline,
  type ApiLessonSummary,
  LearningApi,
  apiErrorMessage,
} from './learning-api';

export interface CourseStoreState {
  courseId: string;
  /** The course, its modules and lesson summaries, and the caller's enrollment. */
  outline: ApiCourseOutline | null;
  loading: boolean;
  error: string | null;
}

const initialState: CourseStoreState = {
  courseId: '',
  outline: null,
  loading: false,
  error: null,
};

/**
 * NgRx SignalStore for a single course context, backed by the Forge API.
 *
 * Call `load(courseId)` after injection. Provide per-component (not root) so each
 * course view gets its own isolated store instance.
 */
export const CourseStore = signalStore(
  withState<CourseStoreState>(initialState),

  withComputed((store) => {
    const lessons = computed<ApiLessonSummary[]>(() =>
      (store.outline()?.modules ?? []).flatMap((m) => m.lessons),
    );
    return {
      /** Every lesson in learner order. */
      lessons,
      /** Percentage of lessons completed (0-100), as the server computed it. */
      progressPct: computed(() => store.outline()?.enrollment?.progressPct ?? 0),
      /** The next lesson the learner should work on. */
      nextLesson: computed(() => lessons().find((l) => !l.completed) ?? null),
      /** True once the enrollment is marked complete. */
      isComplete: computed(() => store.outline()?.enrollment?.completedAt != null),
    };
  }),

  withMethods((store) => {
    const api = inject(LearningApi);

    return {
      /** Loads the course outline together with the caller's enrollment. */
      async load(courseId: string): Promise<void> {
        patchState(store, { loading: true, error: null, courseId });
        try {
          patchState(store, { outline: await api.course(courseId), loading: false });
        } catch (err) {
          // Surface the failure instead of silently rendering an empty course.
          patchState(store, {
            loading: false,
            error: apiErrorMessage(err, 'Failed to load course.'),
          });
        }
      },

      /** Reloads the outline (e.g. after a lesson completes). */
      async refresh(): Promise<void> {
        const courseId = store.courseId();
        if (!courseId) return;
        patchState(store, { outline: await api.course(courseId) });
      },
    };
  }),
);
