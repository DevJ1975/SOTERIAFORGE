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
import type { QuizGrade, QuizResponse } from '@assurance/shared';

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
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }],
    });
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
