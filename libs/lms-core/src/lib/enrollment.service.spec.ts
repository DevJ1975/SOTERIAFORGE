import { TestBed } from '@angular/core/testing';
import type { Firestore } from 'firebase/firestore';
import {
  enrollment as enrollmentSchema,
  XAPI_TENANT_EXTENSION,
  XAPI_VERBS,
  type CourseDraft,
  type Enrollment,
} from '@forge/shared';
import type { Statement } from '@forge/standards';
import {
  completedLessonsOf,
  ForgeEnrollment,
  nextEnrollment,
  progressFor,
  scoreFor,
  withCompletedLesson,
} from './enrollment.service';
import { ForgeXapiEmitter } from './xapi-emitter';

function course(lessonIds: string[]): CourseDraft {
  return {
    id: 'course-1',
    title: 'Lockout/Tagout',
    description: '',
    status: 'published',
    lessons: lessonIds.map((id) => ({ id, title: `Lesson ${id}`, blocks: [] })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function existingEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    uid: 'user-1',
    courseId: 'course-1',
    tenantId: 'acme',
    progressPct: 50,
    completed: false,
    createdAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('progressFor', () => {
  it('is 0 / not completed with nothing done', () => {
    expect(progressFor(course(['a', 'b', 'c']), [])).toEqual({
      progressPct: 0,
      completed: false,
    });
  });

  it('rounds to the nearest whole percent', () => {
    expect(progressFor(course(['a', 'b', 'c']), ['a']).progressPct).toBe(33);
    expect(progressFor(course(['a', 'b', 'c']), ['a', 'b']).progressPct).toBe(67);
    expect(progressFor(course(['a', 'b', 'c', 'd', 'e', 'f']), ['a']).progressPct).toBe(17);
  });

  it('completes at exactly 100', () => {
    expect(progressFor(course(['a', 'b']), ['a', 'b'])).toEqual({
      progressPct: 100,
      completed: true,
    });
  });

  it('ignores ids that are not lessons of the course (e.g. deleted lessons)', () => {
    expect(progressFor(course(['a', 'b']), ['a', 'ghost'])).toEqual({
      progressPct: 50,
      completed: false,
    });
  });

  it('deduplicates repeated ids', () => {
    expect(progressFor(course(['a', 'b']), ['a', 'a', 'a'])).toEqual({
      progressPct: 50,
      completed: false,
    });
  });

  it('treats an empty course as 0 / not completed (no divide-by-zero)', () => {
    expect(progressFor(course([]), [])).toEqual({ progressPct: 0, completed: false });
  });
});

describe('withCompletedLesson', () => {
  it('appends a new lesson id', () => {
    expect(withCompletedLesson(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('is idempotent for an already completed lesson', () => {
    const once = withCompletedLesson(['a'], 'a');
    expect(once).toEqual(['a']);
    expect(withCompletedLesson(once, 'a')).toEqual(['a']);
  });

  it('returns a fresh array (no aliasing of the input)', () => {
    const input = ['a'];
    expect(withCompletedLesson(input, 'a')).not.toBe(input);
  });
});

describe('completedLessonsOf', () => {
  it('returns [] for missing enrollment or cmi', () => {
    expect(completedLessonsOf(undefined)).toEqual([]);
    expect(completedLessonsOf(null)).toEqual([]);
    expect(completedLessonsOf(existingEnrollment())).toEqual([]);
  });

  it('reads completedLessons out of the cmi map', () => {
    const enrollment = existingEnrollment({ cmi: { completedLessons: ['a', 'b'] } });
    expect(completedLessonsOf(enrollment)).toEqual(['a', 'b']);
  });

  it('drops non-string entries and tolerates a non-array value', () => {
    expect(
      completedLessonsOf(existingEnrollment({ cmi: { completedLessons: ['a', 7, null, 'b'] } })),
    ).toEqual(['a', 'b']);
    expect(
      completedLessonsOf(existingEnrollment({ cmi: { completedLessons: 'corrupt' } })),
    ).toEqual([]);
  });

  it('round-trips through nextEnrollment cmi storage', () => {
    const first = nextEnrollment({
      tenantId: 'acme',
      uid: 'user-1',
      course: course(['a', 'b']),
      lessonId: 'a',
      existing: null,
    });
    expect(completedLessonsOf(first)).toEqual(['a']);
    const second = nextEnrollment({
      tenantId: 'acme',
      uid: 'user-1',
      course: course(['a', 'b']),
      lessonId: 'b',
      existing: first,
    });
    expect(completedLessonsOf(second)).toEqual(['a', 'b']);
  });
});

describe('scoreFor', () => {
  it('is undefined with no knowledge-check results', () => {
    expect(scoreFor([])).toBeUndefined();
  });

  it('averages correctness as a rounded 0..100 score', () => {
    expect(scoreFor([true, true])).toBe(100);
    expect(scoreFor([true, false])).toBe(50);
    expect(scoreFor([true, false, false])).toBe(33);
    expect(scoreFor([false])).toBe(0);
  });
});

describe('nextEnrollment', () => {
  const now = '2026-06-11T12:00:00.000Z';

  it('creates a fresh enrollment on first lesson completion', () => {
    const next = nextEnrollment(
      {
        tenantId: 'acme',
        uid: 'user-1',
        course: course(['a', 'b']),
        lessonId: 'a',
        existing: null,
      },
      now,
    );
    expect(next).toEqual({
      uid: 'user-1',
      courseId: 'course-1',
      tenantId: 'acme',
      progressPct: 50,
      completed: false,
      lastActivityAt: now,
      cmi: { completedLessons: ['a'] },
      createdAt: now,
      createdBy: 'user-1',
      updatedAt: now,
      updatedBy: 'user-1',
    });
    // No score key at all when no knowledge checks were answered.
    expect('score' in next).toBe(false);
  });

  it('validates against the @forge/shared enrollment schema', () => {
    const next = nextEnrollment(
      {
        tenantId: 'acme',
        uid: 'user-1',
        course: course(['a']),
        lessonId: 'a',
        existing: null,
        knowledgeCheckResults: [true, false],
      },
      now,
    );
    expect(() => enrollmentSchema.parse(next)).not.toThrow();
  });

  it('completes the course when the last lesson is finished', () => {
    const existing = existingEnrollment({ cmi: { completedLessons: ['a'] } });
    const next = nextEnrollment(
      { tenantId: 'acme', uid: 'user-1', course: course(['a', 'b']), lessonId: 'b', existing },
      now,
    );
    expect(next.progressPct).toBe(100);
    expect(next.completed).toBe(true);
    expect(next.createdAt).toBe(existing.createdAt); // preserved, not reset
  });

  it('is idempotent when re-completing the same lesson', () => {
    const existing = existingEnrollment({ progressPct: 50, cmi: { completedLessons: ['a'] } });
    const next = nextEnrollment(
      { tenantId: 'acme', uid: 'user-1', course: course(['a', 'b']), lessonId: 'a', existing },
      now,
    );
    expect(completedLessonsOf(next)).toEqual(['a']);
    expect(next.progressPct).toBe(50);
    expect(next.completed).toBe(false);
  });

  it('stores the knowledge-check score and keeps a prior score when none is provided', () => {
    const scored = nextEnrollment(
      {
        tenantId: 'acme',
        uid: 'user-1',
        course: course(['a', 'b']),
        lessonId: 'a',
        existing: null,
        knowledgeCheckResults: [true, true, false],
      },
      now,
    );
    expect(scored.score).toBe(67);

    const followUp = nextEnrollment(
      {
        tenantId: 'acme',
        uid: 'user-1',
        course: course(['a', 'b']),
        lessonId: 'b',
        existing: scored,
      },
      now,
    );
    expect(followUp.score).toBe(67);
  });

  it('preserves unrelated cmi keys (SCORM runtime state)', () => {
    const existing = existingEnrollment({
      cmi: { completedLessons: ['a'], suspendData: 'bookmark=3' },
    });
    const next = nextEnrollment(
      { tenantId: 'acme', uid: 'user-1', course: course(['a', 'b']), lessonId: 'b', existing },
      now,
    );
    expect(next.cmi).toEqual({ completedLessons: ['a', 'b'], suspendData: 'bookmark=3' });
  });
});

describe('ForgeEnrollment.markLessonComplete — xAPI emission', () => {
  const db = {} as Firestore;

  /** Service from TestBed with `upsert` stubbed and the emitter replaced. */
  function makeService(emitter: { emit: jest.Mock } | null): ForgeEnrollment {
    TestBed.configureTestingModule({
      providers: [{ provide: ForgeXapiEmitter, useValue: emitter }],
    });
    const service = TestBed.inject(ForgeEnrollment);
    jest.spyOn(service, 'upsert').mockResolvedValue(undefined);
    return service;
  }

  function emittedStatements(emitter: { emit: jest.Mock }, call = 0): Statement[] {
    return emitter.emit.mock.calls[call][0] as Statement[];
  }

  it("emits a tenant-scoped 'progressed' statement for the lesson", async () => {
    const emitter = { emit: jest.fn() };
    const service = makeService(emitter);

    await service.markLessonComplete(db, {
      tenantId: 'acme',
      uid: 'user-1',
      course: course(['a', 'b']),
      lessonId: 'a',
      existing: null,
    });

    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const statements = emittedStatements(emitter);
    expect(statements).toHaveLength(1); // course not yet complete — no 'completed'
    const [progressed] = statements;
    expect(progressed.verb.id).toBe(XAPI_VERBS.progressed);
    expect(progressed.object.id).toBe(
      'https://soteriaforge.com/xapi/activities/lesson/acme/course-1/a',
    );
    expect(progressed.actor.account).toEqual({
      homePage: 'https://soteriaforge.com',
      name: 'user-1',
    });
    expect(progressed.result).toEqual({ completion: true });
    expect(progressed.context.extensions[XAPI_TENANT_EXTENSION]).toBe('acme');
    expect(progressed.context.contextActivities?.parent?.[0]?.id).toBe(
      'https://soteriaforge.com/xapi/activities/course/acme/course-1',
    );
  });

  it("emits 'completed' for the course (with scaled score) when it just became complete", async () => {
    const emitter = { emit: jest.fn() };
    const service = makeService(emitter);
    const existing = existingEnrollment({
      score: 90,
      cmi: { completedLessons: ['a'] },
    });

    await service.markLessonComplete(db, {
      tenantId: 'acme',
      uid: 'user-1',
      course: course(['a', 'b']),
      lessonId: 'b',
      existing,
    });

    const statements = emittedStatements(emitter);
    expect(statements.map((s) => s.verb.id)).toEqual([XAPI_VERBS.progressed, XAPI_VERBS.completed]);
    const completed = statements[1];
    expect(completed.object.id).toBe(
      'https://soteriaforge.com/xapi/activities/course/acme/course-1',
    );
    expect(completed.context.extensions[XAPI_TENANT_EXTENSION]).toBe('acme');
    expect(completed.result).toEqual({
      completion: true,
      score: { scaled: 0.9 },
      success: true,
    });
  });

  it("emits 'completed' without score/success when no score was ever recorded", async () => {
    const emitter = { emit: jest.fn() };
    const service = makeService(emitter);

    await service.markLessonComplete(db, {
      tenantId: 'acme',
      uid: 'user-1',
      course: course(['a']),
      lessonId: 'a',
      existing: null,
    });

    const completed = emittedStatements(emitter)[1];
    expect(completed.verb.id).toBe(XAPI_VERBS.completed);
    expect(completed.result).toEqual({ completion: true });
  });

  it("does not re-emit 'completed' when the course was already complete", async () => {
    const emitter = { emit: jest.fn() };
    const service = makeService(emitter);
    const existing = existingEnrollment({
      progressPct: 100,
      completed: true,
      cmi: { completedLessons: ['a', 'b'] },
    });

    await service.markLessonComplete(db, {
      tenantId: 'acme',
      uid: 'user-1',
      course: course(['a', 'b']),
      lessonId: 'b',
      existing,
    });

    expect(emittedStatements(emitter).map((s) => s.verb.id)).toEqual([XAPI_VERBS.progressed]);
  });

  it('still resolves the enrollment when the emitter throws synchronously', async () => {
    const emitter = {
      emit: jest.fn(() => {
        throw new Error('telemetry down');
      }),
    };
    const service = makeService(emitter);
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    try {
      const next = await service.markLessonComplete(db, {
        tenantId: 'acme',
        uid: 'user-1',
        course: course(['a']),
        lessonId: 'a',
        existing: null,
      });

      expect(emitter.emit).toHaveBeenCalledTimes(1);
      expect(next.completed).toBe(true);
      expect(service.upsert).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('works without an emitter (telemetry fully disabled)', async () => {
    const service = makeService(null);

    const next = await service.markLessonComplete(db, {
      tenantId: 'acme',
      uid: 'user-1',
      course: course(['a', 'b']),
      lessonId: 'a',
      existing: null,
    });

    expect(next.progressPct).toBe(50);
    expect(service.upsert).toHaveBeenCalledTimes(1);
  });
});
