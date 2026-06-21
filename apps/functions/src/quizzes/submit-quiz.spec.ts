import { FakeFirestore } from '../test/fake-firestore';

const mockDb = new FakeFirestore();
const mockRecordCompletion = jest.fn((..._args: unknown[]) => Promise.resolve({}));

jest.mock('firebase-functions/v2/https', () => ({
  onCall: (handler: (req: unknown) => unknown) => handler,
  HttpsError: require('../test/fake-firestore').FakeHttpsError,
}));
jest.mock('../lib/admin', () => ({ db: mockDb }));
jest.mock('../lib/completion', () => ({
  recordModuleCompletion: (...args: unknown[]) => mockRecordCompletion(...args),
}));

import { submitQuiz } from './submit-quiz';

type Handler = (req: unknown) => Promise<Record<string, unknown>>;
const call = submitQuiz as unknown as Handler;

const TENANT = 'acme';
const QUIZ_PATH = `tenants/${TENANT}/quizzes/quiz-1`;
const ENROLL_PATH = `tenants/${TENANT}/courses/c1/enrollments/u1`;

function validQuiz(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quiz-1',
    tenantId: TENANT,
    title: 'Safety basics',
    createdAt: new Date().toISOString(),
    passThreshold: 70,
    maxAttempts: 2,
    randomize: false,
    scoring: 'percent',
    questions: [
      {
        id: 'q1',
        type: 'true_false',
        prompt: 'Is the sky blue?',
        points: 1,
        options: [
          { id: 'o1', text: 'True', isCorrect: true },
          { id: 'o2', text: 'False' },
        ],
        answerKey: [],
      },
    ],
    ...overrides,
  };
}

function req(data: Record<string, unknown>, token: Record<string, unknown> = {}) {
  return {
    auth: { uid: 'u1', token: { role: 'learner', tenantId: TENANT, ...token } },
    data: { tenantId: TENANT, courseId: 'c1', moduleId: 'm1', quizId: 'quiz-1', ...data },
  };
}

const passingResponses = [{ questionId: 'q1', selectedOptionIds: ['o1'] }];

beforeEach(() => {
  mockDb.store.clear();
  mockRecordCompletion.mockClear();
  mockDb.seed(QUIZ_PATH, validQuiz());
});

describe('submitQuiz (server-authoritative anti-cheat)', () => {
  it('rejects unauthenticated callers', async () => {
    await expect((call as Handler)({ data: req({}).data })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('rejects a tenant mismatch', async () => {
    await expect(
      call(req({ responses: passingResponses }, { tenantId: 'other' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a malformed/tampered quiz doc', async () => {
    mockDb.seed(`tenants/${TENANT}/quizzes/quiz-bad`, { id: 'quiz-bad', tenantId: TENANT });
    await expect(
      call(req({ quizId: 'quiz-bad', responses: passingResponses })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('grades a passing submission, records score + completion once', async () => {
    const result = await call(req({ responses: passingResponses }));

    expect(result).toMatchObject({
      passed: true,
      scorePct: 100,
      attemptsUsed: 1,
      attemptsRemaining: 1,
    });
    expect(mockRecordCompletion).toHaveBeenCalledTimes(1);

    const enroll = mockDb.store.get(ENROLL_PATH) as Record<string, unknown>;
    expect(enroll['score']).toBe(100);
    expect((enroll['cmi'] as Record<string, unknown>)['quizAttempts']).toEqual({ 'quiz-1': 1 });
  });

  it('does not complete the module on a failing submission', async () => {
    const result = await call(
      req({ responses: [{ questionId: 'q1', selectedOptionIds: ['o2'] }] }),
    );
    expect(result).toMatchObject({ passed: false, scorePct: 0 });
    expect(mockRecordCompletion).not.toHaveBeenCalled();
  });

  it('enforces maxAttempts across sequential submissions (transactional increment)', async () => {
    await call(req({ responses: passingResponses })); // attempt 1
    await call(req({ responses: passingResponses })); // attempt 2
    await expect(call(req({ responses: passingResponses }))).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    const enroll = mockDb.store.get(ENROLL_PATH) as Record<string, unknown>;
    expect((enroll['cmi'] as Record<string, unknown>)['quizAttempts']).toEqual({ 'quiz-1': 2 });
  });

  it('rejects when attempts are already exhausted', async () => {
    mockDb.seed(ENROLL_PATH, { cmi: { quizAttempts: { 'quiz-1': 2 } } });
    await expect(call(req({ responses: passingResponses }))).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });
});
