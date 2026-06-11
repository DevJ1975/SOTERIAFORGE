import { z } from 'zod';
import { PUBLISH_STATUSES, QUESTION_TYPES } from '../constants';
import { isoDateTime } from './primitives';

/**
 * Forge Studio authoring document model.
 *
 * A course draft is a tree of lessons, each lesson an ordered list of content
 * blocks (discriminated on `kind`). This is the single source of truth shared
 * by the builder (apps/admin) and the lesson renderer (libs/lms-core), so the
 * editing canvas and the learner-facing player stay pixel-identical.
 *
 * Rich-text `html` fields hold a sanitized subset of HTML (see
 * libs/lms-core sanitize-html); they must always pass through the sanitizer
 * before being persisted or bound to the DOM.
 */

/** Stable identifier for blocks and nested items (uuid or short random id). */
export const blockId = z.string().min(1).max(64);

const blockBase = {
  id: blockId,
};

export const headingBlock = z.object({
  ...blockBase,
  kind: z.literal('heading'),
  text: z.string().max(300).default(''),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});
export type HeadingBlock = z.infer<typeof headingBlock>;

export const paragraphBlock = z.object({
  ...blockBase,
  kind: z.literal('paragraph'),
  /** Sanitized rich text (b/strong/i/em/u/a/br only). */
  html: z.string().default(''),
});
export type ParagraphBlock = z.infer<typeof paragraphBlock>;

export const IMAGE_LAYOUTS = ['full', 'centered', 'side'] as const;
export type ImageLayout = (typeof IMAGE_LAYOUTS)[number];

export const imageBlock = z.object({
  ...blockBase,
  kind: z.literal('image'),
  url: z.string().default(''),
  alt: z.string().default(''),
  caption: z.string().optional(),
  layout: z.enum(IMAGE_LAYOUTS).default('full'),
});
export type ImageBlock = z.infer<typeof imageBlock>;

export const videoBlock = z.object({
  ...blockBase,
  kind: z.literal('video'),
  /** Direct file URL, or a YouTube/Vimeo page URL (rendered as an embed). */
  url: z.string().default(''),
  caption: z.string().optional(),
});
export type VideoBlock = z.infer<typeof videoBlock>;

export const bulletListBlock = z.object({
  ...blockBase,
  kind: z.literal('bulletList'),
  items: z.array(z.string()).default([]),
});
export type BulletListBlock = z.infer<typeof bulletListBlock>;

export const numberedListBlock = z.object({
  ...blockBase,
  kind: z.literal('numberedList'),
  items: z.array(z.string()).default([]),
});
export type NumberedListBlock = z.infer<typeof numberedListBlock>;

export const quoteBlock = z.object({
  ...blockBase,
  kind: z.literal('quote'),
  text: z.string().default(''),
  attribution: z.string().optional(),
});
export type QuoteBlock = z.infer<typeof quoteBlock>;

export const CALLOUT_TONES = ['info', 'success', 'warning', 'danger'] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export const calloutBlock = z.object({
  ...blockBase,
  kind: z.literal('callout'),
  tone: z.enum(CALLOUT_TONES).default('info'),
  title: z.string().optional(),
  /** Sanitized rich text. */
  html: z.string().default(''),
});
export type CalloutBlock = z.infer<typeof calloutBlock>;

export const DIVIDER_STYLES = ['line', 'space'] as const;
export type DividerStyle = (typeof DIVIDER_STYLES)[number];

export const dividerBlock = z.object({
  ...blockBase,
  kind: z.literal('divider'),
  style: z.enum(DIVIDER_STYLES).default('line'),
});
export type DividerBlock = z.infer<typeof dividerBlock>;

export const BUTTON_STYLES = ['primary', 'ghost'] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const buttonBlock = z.object({
  ...blockBase,
  kind: z.literal('button'),
  label: z.string().default('Learn more'),
  url: z.string().default(''),
  style: z.enum(BUTTON_STYLES).default('primary'),
});
export type ButtonBlock = z.infer<typeof buttonBlock>;

export const embedBlock = z.object({
  ...blockBase,
  kind: z.literal('embed'),
  url: z.string().default(''),
  /** Iframe height in pixels. */
  height: z.number().int().min(80).max(2000).default(480),
});
export type EmbedBlock = z.infer<typeof embedBlock>;

/** A titled rich-text panel used by accordions and tab sets. */
export const richTextItem = z.object({
  id: blockId,
  title: z.string().default(''),
  /** Sanitized rich text. */
  html: z.string().default(''),
});
export type RichTextItem = z.infer<typeof richTextItem>;

export const accordionBlock = z.object({
  ...blockBase,
  kind: z.literal('accordion'),
  items: z.array(richTextItem).default([]),
});
export type AccordionBlock = z.infer<typeof accordionBlock>;

export const tabsBlock = z.object({
  ...blockBase,
  kind: z.literal('tabs'),
  items: z.array(richTextItem).default([]),
});
export type TabsBlock = z.infer<typeof tabsBlock>;

export const flashcard = z.object({
  id: blockId,
  front: z.string().default(''),
  back: z.string().default(''),
});
export type Flashcard = z.infer<typeof flashcard>;

export const flashcardsBlock = z.object({
  ...blockBase,
  kind: z.literal('flashcards'),
  cards: z.array(flashcard).default([]),
});
export type FlashcardsBlock = z.infer<typeof flashcardsBlock>;

export const KNOWLEDGE_CHECK_TYPES = ['mcq', 'multi_select', 'true_false'] as const;
export type KnowledgeCheckType = (typeof KNOWLEDGE_CHECK_TYPES)[number];

export const knowledgeCheckOption = z.object({
  id: blockId,
  text: z.string().default(''),
  correct: z.boolean().default(false),
});
export type KnowledgeCheckOption = z.infer<typeof knowledgeCheckOption>;

export const knowledgeCheckBlock = z.object({
  ...blockBase,
  kind: z.literal('knowledgeCheck'),
  question: z.string().default(''),
  type: z.enum(KNOWLEDGE_CHECK_TYPES).default('mcq'),
  options: z.array(knowledgeCheckOption).min(2, 'A knowledge check needs at least 2 options'),
  feedbackCorrect: z.string().default('Correct!'),
  feedbackIncorrect: z.string().default('Not quite — review the lesson and try again.'),
});
export type KnowledgeCheckBlock = z.infer<typeof knowledgeCheckBlock>;

// ---- Quiz ------------------------------------------------------------------
//
// A graded, multi-question assessment block — heavier than a knowledge check.
// Questions are a discriminated union on `type` over the six platform
// QUESTION_TYPES; the renderer scores each question 0 or 1 (all-or-nothing
// for multi_select / ordering / matching) and compares the rounded percentage
// against `passingScore`.

/** A selectable quiz answer option (mcq / multi_select) or ordering item. */
export const quizOption = z.object({
  id: blockId,
  text: z.string().default(''),
});
export type QuizOption = z.infer<typeof quizOption>;

/** One left/right pair of a matching question (authored as the correct pair). */
export const matchingPair = z.object({
  id: blockId,
  left: z.string().default(''),
  right: z.string().default(''),
});
export type MatchingPair = z.infer<typeof matchingPair>;

const quizQuestionBase = {
  id: blockId,
  prompt: z.string().default(''),
  /** Optional rationale shown with the per-question feedback. */
  explanation: z.string().optional(),
};

export const mcqQuestion = z.object({
  ...quizQuestionBase,
  type: z.literal('mcq'),
  options: z.array(quizOption).min(2, 'A multiple-choice question needs at least 2 options'),
  correctOptionId: blockId,
});
export type McqQuestion = z.infer<typeof mcqQuestion>;

export const multiSelectQuestion = z.object({
  ...quizQuestionBase,
  type: z.literal('multi_select'),
  options: z.array(quizOption).min(2, 'A multi-select question needs at least 2 options'),
  correctOptionIds: z
    .array(blockId)
    .min(1, 'A multi-select question needs at least 1 correct option'),
});
export type MultiSelectQuestion = z.infer<typeof multiSelectQuestion>;

export const trueFalseQuestion = z.object({
  ...quizQuestionBase,
  type: z.literal('true_false'),
  correct: z.boolean(),
});
export type TrueFalseQuestion = z.infer<typeof trueFalseQuestion>;

export const orderingQuestion = z.object({
  ...quizQuestionBase,
  type: z.literal('ordering'),
  /** Items listed in the correct order; the player presents them shuffled. */
  items: z.array(quizOption).min(2, 'An ordering question needs at least 2 items'),
});
export type OrderingQuestion = z.infer<typeof orderingQuestion>;

export const matchingQuestion = z.object({
  ...quizQuestionBase,
  type: z.literal('matching'),
  pairs: z.array(matchingPair).min(2, 'A matching question needs at least 2 pairs'),
});
export type MatchingQuestion = z.infer<typeof matchingQuestion>;

export const fillInQuestion = z.object({
  ...quizQuestionBase,
  type: z.literal('fill_in'),
  /** Any of these counts as correct (case/whitespace-insensitive match). */
  acceptedAnswers: z
    .array(z.string())
    .min(1, 'A fill-in question needs at least 1 accepted answer'),
});
export type FillInQuestion = z.infer<typeof fillInQuestion>;

const quizQuestionUnion = z.discriminatedUnion('type', [
  mcqQuestion,
  multiSelectQuestion,
  trueFalseQuestion,
  orderingQuestion,
  matchingQuestion,
  fillInQuestion,
]);

/**
 * One quiz question, discriminated on `type` over the six QUESTION_TYPES.
 * Cheap cross-field refinements live here (correct ids must reference real
 * options); the union members stay plain ZodObjects so the discriminated
 * union machinery keeps working.
 */
export const quizQuestion = quizQuestionUnion.superRefine((question, ctx) => {
  if (question.type === 'mcq') {
    if (!question.options.some((option) => option.id === question.correctOptionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctOptionId'],
        message: 'correctOptionId must reference one of the options',
      });
    }
  } else if (question.type === 'multi_select') {
    const ids = new Set(question.options.map((option) => option.id));
    if (!question.correctOptionIds.every((id) => ids.has(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctOptionIds'],
        message: 'Every correctOptionId must reference one of the options',
      });
    }
  }
});
export type QuizQuestion = z.infer<typeof quizQuestionUnion>;
// Compile-time guard: the union covers every platform QUESTION_TYPES entry.
const quizQuestionTypes: readonly QuizQuestion['type'][] = QUESTION_TYPES;
void quizQuestionTypes;

export const quizBlock = z.object({
  ...blockBase,
  kind: z.literal('quiz'),
  title: z.string().max(300).default('Quiz'),
  /** Minimum rounded percentage required to pass. */
  passingScore: z.number().int().min(0).max(100).default(80),
  /** Reshuffle the question order on every run-through. */
  shuffleQuestions: z.boolean().default(false),
  questions: z.array(quizQuestion).min(1, 'A quiz needs at least 1 question'),
});
export type QuizBlock = z.infer<typeof quizBlock>;

/**
 * A SCORM package launched in the embedded runtime (ForgeScormPlayer).
 * `url` points at the package's launch HTML (e.g. an extracted index_lms.html
 * hosted on tenant media or any HTTPS origin).
 */
export const scormBlock = z.object({
  ...blockBase,
  kind: z.literal('scorm'),
  title: z.string().max(300).default('SCORM module'),
  url: z.string().default(''),
  version: z.enum(['1.2', '2004']).default('1.2'),
});
export type ScormBlock = z.infer<typeof scormBlock>;

/** Every authorable content block, discriminated on `kind`. */
export const block = z.discriminatedUnion('kind', [
  headingBlock,
  paragraphBlock,
  imageBlock,
  videoBlock,
  bulletListBlock,
  numberedListBlock,
  quoteBlock,
  calloutBlock,
  dividerBlock,
  buttonBlock,
  embedBlock,
  accordionBlock,
  tabsBlock,
  flashcardsBlock,
  knowledgeCheckBlock,
  quizBlock,
  scormBlock,
]);
export type Block = z.infer<typeof block>;
export type BlockKind = Block['kind'];

export const BLOCK_KINDS = [
  'heading',
  'paragraph',
  'image',
  'video',
  'bulletList',
  'numberedList',
  'quote',
  'callout',
  'divider',
  'button',
  'embed',
  'accordion',
  'tabs',
  'flashcards',
  'knowledgeCheck',
  'quiz',
  'scorm',
] as const satisfies readonly BlockKind[];

export const lessonDraft = z.object({
  id: blockId,
  title: z.string().min(1).max(300),
  blocks: z.array(block).default([]),
});
export type LessonDraft = z.infer<typeof lessonDraft>;

export const courseDraft = z.object({
  id: blockId,
  title: z.string().min(1).max(300),
  description: z.string().max(5000).default(''),
  coverImageUrl: z.string().url().optional(),
  status: z.enum(PUBLISH_STATUSES).default('draft'),
  lessons: z.array(lessonDraft).default([]),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type CourseDraft = z.infer<typeof courseDraft>;
