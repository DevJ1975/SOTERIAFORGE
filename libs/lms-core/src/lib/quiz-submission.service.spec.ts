// Stub @angular/fire/functions so importing it under jsdom doesn't pull in
// Firebase's Node entry, and so we can assert the callable invocations.
const callableImpl = jest.fn();
jest.mock('@angular/fire/functions', () => ({
  Functions: class Functions {},
  httpsCallable: (_fns: unknown, name: string) => {
    return (data: unknown) => callableImpl(name, data);
  },
}));

import { TestBed } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import { QuizSubmissionService } from './quiz-submission.service';
import { installFakeIndexedDb, uninstallFakeIndexedDb } from './fake-indexed-db.testkit';
import type { QuizGrade, QuizResponse } from '@assurance/shared';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const mockGrade: QuizGrade = {
  earnedPoints: 8,
  totalPoints: 10,
  scorePct: 80,
  passed: true,
  perQuestion: [
    { questionId: 'q1', correct: true, awardedPoints: 5 },
    { questionId: 'q2', correct: false, awardedPoints: 0 },
    { questionId: 'q3', correct: true, awardedPoints: 3 },
  ],
};

const mockResponses: QuizResponse[] = [
  { questionId: 'q1', selectedOptionIds: ['opt-a'] },
  { questionId: 'q2', selectedOptionIds: ['opt-b'] },
  { questionId: 'q3', text: 'correct answer' },
];

describe('QuizSubmissionService', () => {
  beforeEach(() => {
    callableImpl.mockReset();
    setOnline(true);
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }],
    });
  });

  afterEach(() => {
    setOnline(true);
  });

  it('should be created', () => {
    const svc = TestBed.inject(QuizSubmissionService);
    expect(svc).toBeTruthy();
  });

  it('invokes submitQuiz callable with the correct payload', async () => {
    callableImpl.mockResolvedValue({ data: mockGrade });

    const svc = TestBed.inject(QuizSubmissionService);
    const result = await svc.submit({
      tenantId: 'acme',
      courseId: 'course-1',
      moduleId: 'mod-1',
      quizId: 'quiz-1',
      responses: mockResponses,
    });

    expect(callableImpl).toHaveBeenCalledWith('submitQuiz', {
      tenantId: 'acme',
      courseId: 'course-1',
      moduleId: 'mod-1',
      quizId: 'quiz-1',
      responses: mockResponses,
    });
    expect(result.scorePct).toBe(80);
    expect(result.passed).toBe(true);
  });

  it('returns the full QuizGrade including perQuestion', async () => {
    callableImpl.mockResolvedValue({ data: mockGrade });

    const svc = TestBed.inject(QuizSubmissionService);
    const result = await svc.submit({
      tenantId: 'acme',
      courseId: 'c1',
      moduleId: 'm1',
      quizId: 'q1',
      responses: mockResponses,
    });

    expect(result.perQuestion).toHaveLength(3);
    expect(result.perQuestion[0].correct).toBe(true);
    expect(result.earnedPoints).toBe(8);
    expect(result.totalPoints).toBe(10);
  });

  it('propagates callable rejection', async () => {
    callableImpl.mockRejectedValue(new Error('functions/unauthenticated'));

    const svc = TestBed.inject(QuizSubmissionService);
    await expect(
      svc.submit({
        tenantId: 'acme',
        courseId: 'c1',
        moduleId: 'm1',
        quizId: 'q1',
        responses: [],
      }),
    ).rejects.toThrow('functions/unauthenticated');
  });
});

// ---------------------------------------------------------------------------
// MO-08 — offline submission outbox
// ---------------------------------------------------------------------------
describe('QuizSubmissionService — offline outbox (MO-08)', () => {
  const input = {
    tenantId: 'acme',
    courseId: 'c1',
    moduleId: 'm1',
    quizId: 'quiz-1',
    responses: mockResponses,
  };

  beforeEach(() => {
    callableImpl.mockReset();
    installFakeIndexedDb();
    setOnline(true);
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }],
    });
  });

  afterEach(() => {
    uninstallFakeIndexedDb();
    setOnline(true);
    TestBed.resetTestingModule();
  });

  it('grades synchronously when online and the callable succeeds', async () => {
    callableImpl.mockResolvedValue({ data: mockGrade });
    const svc = TestBed.inject(QuizSubmissionService);

    const outcome = await svc.submitWithOutbox(input);

    expect(outcome.graded).toBe(true);
    expect(outcome.queued).toBe(false);
    expect(outcome.grade?.scorePct).toBe(80);
    expect(svc.pendingCount()).toBe(0);
  });

  it('queues the attempt when offline (no callable attempted)', async () => {
    setOnline(false);
    const svc = TestBed.inject(QuizSubmissionService);

    const outcome = await svc.submitWithOutbox(input);

    expect(outcome.graded).toBe(false);
    expect(outcome.queued).toBe(true);
    expect(callableImpl).not.toHaveBeenCalled();
    expect(svc.pendingCount()).toBe(1);
  });

  it('queues the attempt when the callable rejects while online', async () => {
    callableImpl.mockRejectedValue(new Error('functions/internal'));
    const svc = TestBed.inject(QuizSubmissionService);

    const outcome = await svc.submitWithOutbox(input);

    expect(outcome.queued).toBe(true);
    expect(svc.pendingCount()).toBe(1);
  });

  it('queue-then-flush: a queued attempt is sent and graded on reconnect', async () => {
    // Queue while offline.
    setOnline(false);
    const svc = TestBed.inject(QuizSubmissionService);
    await svc.submitWithOutbox(input);
    expect(svc.pendingCount()).toBe(1);

    // Capture the reconciled grade delivered on flush.
    const reconciled: Array<{ quizId: string; grade: QuizGrade }> = [];
    svc.onReconciled((quizId, grade) => reconciled.push({ quizId, grade }));

    // Reconnect: the callable now succeeds, flush drains the outbox.
    callableImpl.mockResolvedValue({ data: mockGrade });
    setOnline(true);
    await svc.flushOutbox();

    expect(callableImpl).toHaveBeenCalledTimes(1);
    expect(callableImpl).toHaveBeenCalledWith('submitQuiz', input);
    expect(svc.pendingCount()).toBe(0);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0].quizId).toBe('quiz-1');
    expect(reconciled[0].grade.scorePct).toBe(80);
  });

  it('a queued attempt survives a reload and flushes on startup', async () => {
    setOnline(false);
    const first = TestBed.inject(QuizSubmissionService);
    await first.submitWithOutbox(input);
    await flushMicrotasks();
    expect(first.pendingCount()).toBe(1);

    // Reload already-online: the constructor's startup flush should drain it.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Functions, useValue: {} }] });
    callableImpl.mockResolvedValue({ data: mockGrade });
    setOnline(true);

    const reloaded = TestBed.inject(QuizSubmissionService);
    await flushMicrotasks();

    expect(callableImpl).toHaveBeenCalledWith('submitQuiz', input);
    expect(reloaded.pendingCount()).toBe(0);
  });

  it('the online event triggers an outbox flush', async () => {
    setOnline(false);
    const svc = TestBed.inject(QuizSubmissionService);
    await svc.submitWithOutbox(input);
    expect(svc.pendingCount()).toBe(1);

    callableImpl.mockResolvedValue({ data: mockGrade });
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await flushMicrotasks();

    expect(callableImpl).toHaveBeenCalledWith('submitQuiz', input);
    expect(svc.pendingCount()).toBe(0);
  });
});
