import type {
  FillInQuestion,
  MatchingQuestion,
  McqQuestion,
  MultiSelectQuestion,
  OrderingQuestion,
  QuizQuestion,
  TrueFalseQuestion,
} from '@forge/shared';

/**
 * Pure scoring rules for the quiz block. Every question scores 0 or 1;
 * multi_select, ordering, and matching are all-or-nothing. The quiz score is
 * the rounded percentage of correct questions, compared against the block's
 * `passingScore`.
 */

/**
 * Learner's in-flight answer to one quiz question. Only the slice matching
 * the question type is meaningful; the rest stays at its empty default.
 */
export interface QuizQuestionAnswer {
  /** mcq: [optionId] · true_false: ['true'|'false'] · multi_select: optionIds. */
  selected: readonly string[];
  /** ordering: item ids in the learner's current top-to-bottom order. */
  order: readonly string[];
  /** matching: pair id → pair id whose right side the learner chose. */
  matches: Readonly<Record<string, string>>;
  /** fill_in: free text. */
  text: string;
}

export const EMPTY_QUIZ_ANSWER: QuizQuestionAnswer = {
  selected: [],
  order: [],
  matches: {},
  text: '',
};

/** Trim, lowercase, and collapse inner whitespace for fill-in comparison. */
export function normalizeFillIn(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function scoreMcq(question: McqQuestion, selected: readonly string[]): boolean {
  return selected.length === 1 && selected[0] === question.correctOptionId;
}

/** All-or-nothing: the selection must equal the correct set exactly. */
export function scoreMultiSelect(
  question: MultiSelectQuestion,
  selected: readonly string[],
): boolean {
  const correct = new Set(question.correctOptionIds);
  return selected.length === correct.size && selected.every((id) => correct.has(id));
}

export function scoreTrueFalse(question: TrueFalseQuestion, selected: readonly string[]): boolean {
  return selected.length === 1 && selected[0] === String(question.correct);
}

/** All-or-nothing: every item must sit at its authored position. */
export function scoreOrdering(question: OrderingQuestion, order: readonly string[]): boolean {
  return (
    order.length === question.items.length &&
    question.items.every((item, index) => order[index] === item.id)
  );
}

/** All-or-nothing: every pair must be matched with its own right side. */
export function scoreMatching(
  question: MatchingQuestion,
  matches: Readonly<Record<string, string>>,
): boolean {
  return question.pairs.every((pair) => matches[pair.id] === pair.id);
}

/** Case/whitespace-insensitive match against any accepted answer. */
export function scoreFillIn(question: FillInQuestion, text: string): boolean {
  const normalized = normalizeFillIn(text);
  return question.acceptedAnswers.some((answer) => normalizeFillIn(answer) === normalized);
}

/** Scores one question (0/1) from the learner's answer state. */
export function scoreQuestion(question: QuizQuestion, answer: QuizQuestionAnswer): boolean {
  switch (question.type) {
    case 'mcq':
      return scoreMcq(question, answer.selected);
    case 'multi_select':
      return scoreMultiSelect(question, answer.selected);
    case 'true_false':
      return scoreTrueFalse(question, answer.selected);
    case 'ordering':
      return scoreOrdering(question, answer.order);
    case 'matching':
      return scoreMatching(question, answer.matches);
    case 'fill_in':
      return scoreFillIn(question, answer.text);
  }
}

/** True once the learner has answered enough to press 'Check'. */
export function isQuestionAnswerable(question: QuizQuestion, answer: QuizQuestionAnswer): boolean {
  switch (question.type) {
    case 'mcq':
    case 'true_false':
      return answer.selected.length === 1;
    case 'multi_select':
      return answer.selected.length > 0;
    case 'ordering':
      // The presented order is itself an answer.
      return answer.order.length === question.items.length;
    case 'matching':
      return question.pairs.every((pair) => !!answer.matches[pair.id]);
    case 'fill_in':
      return normalizeFillIn(answer.text).length > 0;
  }
}

/** Rounded percentage of correct questions; 0 for an empty result set. */
export function quizScore(results: readonly boolean[]): number {
  if (results.length === 0) return 0;
  return Math.round((100 * results.filter(Boolean).length) / results.length);
}

export function quizPassed(score: number, passingScore: number): boolean {
  return score >= passingScore;
}

/** Non-mutating Fisher–Yates shuffle. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Shuffle that never returns the original order (for 2+ items): used for
 * ordering questions so they never start out already solved. Falls back to a
 * single rotation when the shuffle lands on the input order.
 */
export function shuffledAwayFrom<T>(items: readonly T[], random: () => number = Math.random): T[] {
  if (items.length < 2) return items.slice();
  const result = shuffled(items, random);
  if (result.every((item, index) => item === items[index])) {
    result.push(result.shift() as T);
  }
  return result;
}
