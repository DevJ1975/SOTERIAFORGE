import type {
  FillInQuestion,
  MatchingQuestion,
  McqQuestion,
  MultiSelectQuestion,
  OrderingQuestion,
  TrueFalseQuestion,
} from '@forge/shared';
import {
  EMPTY_QUIZ_ANSWER,
  isQuestionAnswerable,
  normalizeFillIn,
  quizPassed,
  quizScore,
  scoreFillIn,
  scoreMatching,
  scoreMcq,
  scoreMultiSelect,
  scoreOrdering,
  scoreQuestion,
  scoreTrueFalse,
  shuffled,
  shuffledAwayFrom,
} from './quiz-scoring';

const mcq: McqQuestion = {
  id: 'q1',
  type: 'mcq',
  prompt: 'Pick one',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ],
  correctOptionId: 'b',
};

const multi: MultiSelectQuestion = {
  id: 'q2',
  type: 'multi_select',
  prompt: 'Pick several',
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ],
  correctOptionIds: ['a', 'c'],
};

const trueFalse: TrueFalseQuestion = {
  id: 'q3',
  type: 'true_false',
  prompt: 'Yes?',
  correct: true,
};

const ordering: OrderingQuestion = {
  id: 'q4',
  type: 'ordering',
  prompt: 'Order these',
  items: [
    { id: 'first', text: '1' },
    { id: 'second', text: '2' },
    { id: 'third', text: '3' },
  ],
};

const matching: MatchingQuestion = {
  id: 'q5',
  type: 'matching',
  prompt: 'Match these',
  pairs: [
    { id: 'p1', left: 'L1', right: 'R1' },
    { id: 'p2', left: 'L2', right: 'R2' },
  ],
};

const fillIn: FillInQuestion = {
  id: 'q6',
  type: 'fill_in',
  prompt: 'The ____ states capacity.',
  acceptedAnswers: ['Data Plate', '  name  plate '],
};

describe('normalizeFillIn', () => {
  it('trims, lowercases, and collapses inner whitespace', () => {
    expect(normalizeFillIn('  Data   PLATE  ')).toBe('data plate');
    expect(normalizeFillIn('data\t\nplate')).toBe('data plate');
    expect(normalizeFillIn('')).toBe('');
  });
});

describe('scoreMcq', () => {
  it('is correct only for exactly the correct option', () => {
    expect(scoreMcq(mcq, ['b'])).toBe(true);
    expect(scoreMcq(mcq, ['a'])).toBe(false);
    expect(scoreMcq(mcq, [])).toBe(false);
    expect(scoreMcq(mcq, ['a', 'b'])).toBe(false);
  });
});

describe('scoreMultiSelect (all-or-nothing)', () => {
  it('requires the exact correct set, in any order', () => {
    expect(scoreMultiSelect(multi, ['a', 'c'])).toBe(true);
    expect(scoreMultiSelect(multi, ['c', 'a'])).toBe(true);
  });

  it('fails partial, superset, and empty selections', () => {
    expect(scoreMultiSelect(multi, ['a'])).toBe(false); // partial → no credit
    expect(scoreMultiSelect(multi, ['a', 'b', 'c'])).toBe(false); // superset
    expect(scoreMultiSelect(multi, [])).toBe(false);
  });
});

describe('scoreTrueFalse', () => {
  it('matches the stringified boolean', () => {
    expect(scoreTrueFalse(trueFalse, ['true'])).toBe(true);
    expect(scoreTrueFalse(trueFalse, ['false'])).toBe(false);
    expect(scoreTrueFalse({ ...trueFalse, correct: false }, ['false'])).toBe(true);
    expect(scoreTrueFalse(trueFalse, [])).toBe(false);
  });
});

describe('scoreOrdering (all-or-nothing)', () => {
  it('is correct only when every item sits at its authored position', () => {
    expect(scoreOrdering(ordering, ['first', 'second', 'third'])).toBe(true);
    expect(scoreOrdering(ordering, ['first', 'third', 'second'])).toBe(false);
    expect(scoreOrdering(ordering, ['third', 'second', 'first'])).toBe(false);
    expect(scoreOrdering(ordering, ['first', 'second'])).toBe(false); // missing item
  });
});

describe('scoreMatching (all-or-nothing)', () => {
  it('requires every pair matched with its own right side', () => {
    expect(scoreMatching(matching, { p1: 'p1', p2: 'p2' })).toBe(true);
    expect(scoreMatching(matching, { p1: 'p2', p2: 'p1' })).toBe(false);
    expect(scoreMatching(matching, { p1: 'p1' })).toBe(false); // one unanswered
    expect(scoreMatching(matching, {})).toBe(false);
  });
});

describe('scoreFillIn', () => {
  it('matches any accepted answer, case/whitespace-insensitively', () => {
    expect(scoreFillIn(fillIn, 'data plate')).toBe(true);
    expect(scoreFillIn(fillIn, '  DATA   plate ')).toBe(true);
    expect(scoreFillIn(fillIn, 'name plate')).toBe(true); // accepted answers normalize too
    expect(scoreFillIn(fillIn, 'dataplate')).toBe(false); // missing space is a different word
    expect(scoreFillIn(fillIn, '')).toBe(false);
  });
});

describe('scoreQuestion dispatch', () => {
  it('routes each type to its scorer through the shared answer shape', () => {
    expect(scoreQuestion(mcq, { ...EMPTY_QUIZ_ANSWER, selected: ['b'] })).toBe(true);
    expect(scoreQuestion(multi, { ...EMPTY_QUIZ_ANSWER, selected: ['a', 'c'] })).toBe(true);
    expect(scoreQuestion(trueFalse, { ...EMPTY_QUIZ_ANSWER, selected: ['true'] })).toBe(true);
    expect(
      scoreQuestion(ordering, { ...EMPTY_QUIZ_ANSWER, order: ['first', 'second', 'third'] }),
    ).toBe(true);
    expect(scoreQuestion(matching, { ...EMPTY_QUIZ_ANSWER, matches: { p1: 'p1', p2: 'p2' } })).toBe(
      true,
    );
    expect(scoreQuestion(fillIn, { ...EMPTY_QUIZ_ANSWER, text: 'Data Plate' })).toBe(true);
    expect(scoreQuestion(fillIn, EMPTY_QUIZ_ANSWER)).toBe(false);
  });
});

describe('isQuestionAnswerable', () => {
  it('gates the Check button per type', () => {
    expect(isQuestionAnswerable(mcq, EMPTY_QUIZ_ANSWER)).toBe(false);
    expect(isQuestionAnswerable(mcq, { ...EMPTY_QUIZ_ANSWER, selected: ['a'] })).toBe(true);
    expect(isQuestionAnswerable(multi, EMPTY_QUIZ_ANSWER)).toBe(false);
    expect(isQuestionAnswerable(multi, { ...EMPTY_QUIZ_ANSWER, selected: ['b'] })).toBe(true);
    expect(isQuestionAnswerable(trueFalse, { ...EMPTY_QUIZ_ANSWER, selected: ['false'] })).toBe(
      true,
    );
    // Ordering: the presented order itself is an answer.
    expect(
      isQuestionAnswerable(ordering, {
        ...EMPTY_QUIZ_ANSWER,
        order: ['third', 'first', 'second'],
      }),
    ).toBe(true);
    expect(isQuestionAnswerable(matching, { ...EMPTY_QUIZ_ANSWER, matches: { p1: 'p2' } })).toBe(
      false,
    );
    expect(
      isQuestionAnswerable(matching, { ...EMPTY_QUIZ_ANSWER, matches: { p1: 'p2', p2: 'p1' } }),
    ).toBe(true);
    expect(isQuestionAnswerable(fillIn, { ...EMPTY_QUIZ_ANSWER, text: '   ' })).toBe(false);
    expect(isQuestionAnswerable(fillIn, { ...EMPTY_QUIZ_ANSWER, text: 'x' })).toBe(true);
  });
});

describe('quizScore / quizPassed', () => {
  it('rounds the percentage of correct questions', () => {
    expect(quizScore([true, true, true])).toBe(100);
    expect(quizScore([true, false])).toBe(50);
    expect(quizScore([true, false, false])).toBe(33);
    expect(quizScore([true, true, false])).toBe(67);
    expect(quizScore([false])).toBe(0);
    expect(quizScore([])).toBe(0);
  });

  it('passes at or above the passing score', () => {
    expect(quizPassed(80, 80)).toBe(true);
    expect(quizPassed(79, 80)).toBe(false);
    expect(quizPassed(100, 0)).toBe(true);
    expect(quizPassed(0, 0)).toBe(true);
  });
});

describe('shuffles', () => {
  it('shuffled preserves the members without mutating the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffled(input);
    expect(result).toHaveLength(4);
    expect([...result].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });

  it('shuffledAwayFrom never returns the original order for 2+ items', () => {
    for (let i = 0; i < 25; i++) {
      expect(shuffledAwayFrom(['x', 'y'])).toEqual(['y', 'x']);
      expect(shuffledAwayFrom(['1', '2', '3'])).not.toEqual(['1', '2', '3']);
    }
    expect(shuffledAwayFrom(['solo'])).toEqual(['solo']);
    expect(shuffledAwayFrom([])).toEqual([]);
  });
});
