import { TestBed } from '@angular/core/testing';
import { type ApiCourseOutline, LearningApi } from './learning-api';
import { CourseStore } from './course.store';

function outline(done: boolean[], completedAt: string | null = null): ApiCourseOutline {
  return {
    id: 'c1',
    title: 'Course',
    description: '',
    status: 'published',
    tags: [],
    availableOffline: false,
    createdAt: '',
    updatedAt: '',
    modules: [
      {
        id: 'm1',
        courseId: 'c1',
        title: 'M1',
        label: '',
        order: 0,
        lessons: done.map((completed, i) => ({
          id: `l${i}`,
          title: `L${i}`,
          order: i,
          contentType: 'video' as const,
          estimatedMinutes: null,
          frameworkTags: [],
          hasQuiz: false,
          completed,
        })),
      },
    ],
    enrollment: {
      id: 'e1',
      courseId: 'c1',
      memberId: 'u1',
      assigned: false,
      dueAt: null,
      progressPct: 50,
      completedAt,
      lastActivityAt: null,
      createdAt: '',
    },
  };
}

describe('CourseStore', () => {
  function setup(course: jest.Mock) {
    TestBed.configureTestingModule({
      providers: [CourseStore, { provide: LearningApi, useValue: { course } }],
    });
    return TestBed.inject(CourseStore);
  }

  it('loads the outline and derives progress and the next lesson', async () => {
    const store = setup(jest.fn(async () => outline([true, false])));
    await store.load('c1');
    expect(store.loading()).toBe(false);
    expect(store.progressPct()).toBe(50);
    expect(store.nextLesson()?.id).toBe('l1');
    expect(store.isComplete()).toBe(false);
  });

  it('reports completion from the enrollment', async () => {
    const store = setup(jest.fn(async () => outline([true, true], '2026-10-01T00:00:00Z')));
    await store.load('c1');
    expect(store.isComplete()).toBe(true);
    expect(store.nextLesson()).toBeNull();
  });

  it('surfaces load failures', async () => {
    const store = setup(
      jest.fn(async () => {
        throw new Error('boom');
      }),
    );
    await store.load('c1');
    expect(store.error()).toBe('Failed to load course.');
    expect(store.outline()).toBeNull();
  });
});
