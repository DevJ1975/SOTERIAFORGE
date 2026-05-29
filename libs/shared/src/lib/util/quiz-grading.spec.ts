import type { Quiz } from '../schemas/quiz';
import { type QuizResponse, gradeQuiz } from './quiz-grading';

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 'q1',
    tenantId: 'acme',
    title: 'Safety',
    passThreshold: 70,
    randomize: false,
    scoring: 'percent',
    createdAt: '2026-01-01T00:00:00Z',
    questions: [
      {
        id: 'm',
        type: 'mcq',
        prompt: 'Pick A',
        points: 1,
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B' },
        ],
        answerKey: [],
      },
      {
        id: 'ms',
        type: 'multi_select',
        prompt: 'Pick A and C',
        points: 2,
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C', isCorrect: true },
        ],
        answerKey: [],
      },
      {
        id: 'fi',
        type: 'fill_in',
        prompt: 'Capital of France?',
        points: 1,
        options: [],
        answerKey: ['Paris'],
      },
    ],
    ...overrides,
  };
}

describe('gradeQuiz', () => {
  it('grades a fully correct submission as 100% and passed', () => {
    const responses: QuizResponse[] = [
      { questionId: 'm', selectedOptionIds: ['a'] },
      { questionId: 'ms', selectedOptionIds: ['a', 'c'] },
      { questionId: 'fi', text: 'paris' },
    ];
    const g = gradeQuiz(quiz(), responses);
    expect(g.earnedPoints).toBe(4);
    expect(g.totalPoints).toBe(4);
    expect(g.scorePct).toBe(100);
    expect(g.passed).toBe(true);
  });

  it('multi_select requires the exact set', () => {
    const g = gradeQuiz(quiz(), [{ questionId: 'ms', selectedOptionIds: ['a'] }]);
    expect(g.perQuestion.find((p) => p.questionId === 'ms')?.correct).toBe(false);
  });

  it('fill_in is case/space-insensitive', () => {
    const g = gradeQuiz(quiz(), [{ questionId: 'fi', text: '  PARIS ' }]);
    expect(g.perQuestion.find((p) => p.questionId === 'fi')?.correct).toBe(true);
  });

  it('computes pass/fail against the threshold', () => {
    // Only the 1pt mcq correct => 25% < 70% => fail.
    const g = gradeQuiz(quiz(), [{ questionId: 'm', selectedOptionIds: ['a'] }]);
    expect(g.scorePct).toBe(25);
    expect(g.passed).toBe(false);
  });

  it('ordering must match the answer key order', () => {
    const q = quiz({
      passThreshold: 100,
      questions: [
        {
          id: 'o',
          type: 'ordering',
          prompt: 'Order',
          points: 1,
          options: [
            { id: 'x', text: 'X' },
            { id: 'y', text: 'Y' },
          ],
          answerKey: ['x', 'y'],
        },
      ],
    });
    expect(gradeQuiz(q, [{ questionId: 'o', order: ['x', 'y'] }]).passed).toBe(true);
    expect(gradeQuiz(q, [{ questionId: 'o', order: ['y', 'x'] }]).passed).toBe(false);
  });

  it('missing responses score zero', () => {
    expect(gradeQuiz(quiz(), []).scorePct).toBe(0);
  });
});
