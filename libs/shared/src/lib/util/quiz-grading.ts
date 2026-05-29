import type { Quiz, QuizQuestion } from '../schemas/quiz';

/** A learner's answer to one question. */
export interface QuizResponse {
  questionId: string;
  /** Selected option ids (mcq/true_false: one; multi_select: many; matching: pairs encoded as "left:right"). */
  selectedOptionIds?: string[];
  /** Free text (fill_in). */
  text?: string;
  /** Ordered option ids (ordering). */
  order?: string[];
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  awardedPoints: number;
}

export interface QuizGrade {
  earnedPoints: number;
  totalPoints: number;
  /** 0–100, rounded. */
  scorePct: number;
  passed: boolean;
  perQuestion: QuestionResult[];
}

const norm = (s: string) => s.trim().toLowerCase();
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Grade a quiz against a learner's responses. Pure + deterministic so it can run
 * identically on the client (preview) and on the server (authoritative,
 * anti-cheat). The server is the source of truth; client grading is advisory.
 */
export function gradeQuiz(quiz: Quiz, responses: QuizResponse[]): QuizGrade {
  const byId = new Map(responses.map((r) => [r.questionId, r]));
  let earnedPoints = 0;
  let totalPoints = 0;
  const perQuestion: QuestionResult[] = [];

  for (const q of quiz.questions) {
    totalPoints += q.points;
    const correct = isCorrect(q, byId.get(q.id));
    const awardedPoints = correct ? q.points : 0;
    earnedPoints += awardedPoints;
    perQuestion.push({ questionId: q.id, correct, awardedPoints });
  }

  const scorePct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  return {
    earnedPoints,
    totalPoints,
    scorePct,
    passed: scorePct >= quiz.passThreshold,
    perQuestion,
  };
}

function isCorrect(q: QuizQuestion, r: QuizResponse | undefined): boolean {
  if (!r) return false;
  const correctOptionIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);

  switch (q.type) {
    case 'mcq':
    case 'true_false':
      return (r.selectedOptionIds?.length === 1 &&
        correctOptionIds.includes(r.selectedOptionIds[0])) as boolean;

    case 'multi_select':
      return sameSet(r.selectedOptionIds ?? [], correctOptionIds);

    case 'ordering':
      // answerKey is the option ids in the correct order.
      return (
        (r.order?.length ?? 0) === q.answerKey.length &&
        (r.order ?? []).every((id, i) => id === q.answerKey[i])
      );

    case 'matching':
      // answerKey holds the correct "left:right" pairs; selectedOptionIds the chosen pairs.
      return sameSet(r.selectedOptionIds ?? [], q.answerKey);

    case 'fill_in':
      // Correct if the normalized text matches any accepted answer in answerKey.
      return !!r.text && q.answerKey.some((a) => norm(a) === norm(r.text as string));

    default:
      return false;
  }
}
