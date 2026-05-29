import { z } from 'zod';
import { GAME_ENGINES, QUESTION_TYPES } from '../constants';
import { auditable, count, docId, storageRef, tenantId } from './primitives';

const baseQuestion = z.object({
  id: docId,
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(1),
  points: count.default(1),
});

/** Discriminated-ish question variants kept flexible for the builder. */
export const quizQuestion = baseQuestion.extend({
  /** Options for choice/ordering/matching questions. */
  options: z
    .array(z.object({ id: docId, text: z.string(), isCorrect: z.boolean().optional() }))
    .default([]),
  /** Correct answers for fill-in / ordering keyed by option id or text. */
  answerKey: z.array(z.string()).default([]),
  feedback: z
    .object({ correct: z.string().optional(), incorrect: z.string().optional() })
    .optional(),
});
export type QuizQuestion = z.infer<typeof quizQuestion>;

/** /tenants/{tenantId}/quizzes/{quizId} */
export const quiz = auditable.extend({
  id: docId,
  tenantId,
  title: z.string().min(1).max(300),
  questions: z.array(quizQuestion).default([]),
  passThreshold: z.number().min(0).max(100).default(70),
  maxAttempts: count.optional(),
  randomize: z.boolean().default(false),
  scoring: z.enum(['percent', 'points']).default('percent'),
});
export type Quiz = z.infer<typeof quiz>;

/** /tenants/{tenantId}/games/{gameId} — interactive card/mini games. */
export const game = auditable.extend({
  id: docId,
  tenantId,
  title: z.string().min(1).max(300),
  engine: z.enum(GAME_ENGINES),
  /** Template-driven, no-code config consumed by the Phaser/PixiJS renderer. */
  config: z.record(z.string(), z.unknown()).default({}),
  assetRefs: z.array(storageRef).default([]),
  /** Optional Rive character bound to reactive states. */
  riveAssetRef: storageRef.optional(),
});
export type Game = z.infer<typeof game>;
