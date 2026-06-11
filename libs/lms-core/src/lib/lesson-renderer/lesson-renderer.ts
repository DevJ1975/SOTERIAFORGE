import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import type {
  AccordionBlock,
  FlashcardsBlock,
  KnowledgeCheckBlock,
  LessonDraft,
  MatchingQuestion,
  OrderingQuestion,
  QuizBlock,
  QuizQuestion,
  ScormBlock,
  TabsBlock,
} from '@forge/shared';
import type { ScormStatusChange } from '@forge/standards';
import { sanitizeHtml } from '../sanitize-html';
import { ForgeScormPlayer } from '../scorm/scorm-player';
import {
  isQuestionAnswerable,
  quizPassed,
  quizScore,
  scoreQuestion,
  shuffled,
  shuffledAwayFrom,
  type QuizQuestionAnswer,
} from './quiz-scoring';

// Pure quiz scoring rules ride along with the renderer export.
export * from './quiz-scoring';

interface KnowledgeCheckState {
  selected: string[];
  result: 'correct' | 'incorrect' | null;
}

const EMPTY_KC_STATE: KnowledgeCheckState = { selected: [], result: null };

/** Mutable per-question answer state plus its checked result. */
interface QuizAnswerState extends QuizQuestionAnswer {
  selected: string[];
  order: string[];
  matches: Record<string, string>;
  text: string;
  /** null until the learner checks the question. */
  result: boolean | null;
}

/** One run-through of a quiz block (rebuilt on lesson change and retake). */
interface QuizRunState {
  /** Question ids in presentation order for this run-through. */
  sequence: string[];
  /** Position in `sequence`; equal to its length on the results screen. */
  index: number;
  /** question id → answer state. */
  answers: Record<string, QuizAnswerState>;
  /** matching question id → pair ids in shuffled right-column order. */
  rightsOrder: Record<string, string[]>;
  /** 1-based run-through counter (drives firstAttempt semantics). */
  attempt: number;
}

/**
 * Emitted every time a knowledge check is checked (not on retry-reset), and
 * once per quiz run-through when its results screen is reached (a quiz is one
 * "check"; `correct` carries pass/fail against its passing score).
 */
export interface CheckAnsweredEvent {
  blockId: string;
  correct: boolean;
  /** True only for the first check of a block; retries re-emit with false. */
  firstAttempt: boolean;
}

/** Aggregate check state (knowledge checks + quizzes) for the current lesson. */
export interface ChecksStateEvent {
  /** knowledgeCheck + quiz blocks in the lesson (0 for check-less lessons). */
  total: number;
  /** Blocks answered/completed at least once (retries never decrement this). */
  answered: number;
  /** Blocks correct (quiz: passed) on their very first attempt. */
  correctOnFirstAttempt: number;
}

/**
 * Renders a Forge Studio lesson read-only but fully interactive: accordions
 * expand, tabs switch, flashcards flip, knowledge checks are answerable.
 *
 * This is the exact surface the learner player will ship with, so the
 * builder's preview mode is pixel-identical by construction. All rich-text
 * fields pass through the allowlist sanitizer before being bound.
 *
 * Knowledge-check progress is reported through two outputs — `checkAnswered`
 * per check click and the aggregate `checksState` — so the player can score
 * lessons and auto-complete them. Answer state resets when `lesson` changes.
 */
@Component({
  selector: 'forge-lesson-renderer',
  imports: [ForgeScormPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lesson-renderer.html',
  styleUrl: './lesson-renderer.scss',
})
export class ForgeLessonRenderer {
  readonly lesson = input.required<LessonDraft>();

  /** Fires on every 'Check answer' click; retries fire with firstAttempt false. */
  readonly checkAnswered = output<CheckAnsweredEvent>();
  /**
   * Fires whenever the aggregate check state changes, including once per
   * `lesson` input change so hosts learn the lesson's total up front (total: 0
   * for lessons without checks).
   */
  readonly checksState = output<ChecksStateEvent>();

  private readonly domSanitizer = inject(DomSanitizer);
  private readonly htmlCache = new Map<string, SafeHtml>();
  private readonly resourceCache = new Map<string, SafeResourceUrl>();

  /** `${blockId}:${itemId}` → expanded */
  protected readonly openPanels = signal<Record<string, boolean>>({});
  /** blockId → active tab item id */
  protected readonly activeTabs = signal<Record<string, string>>({});
  /** `${blockId}:${cardId}` → flipped */
  protected readonly flippedCards = signal<Record<string, boolean>>({});
  /** blockId → knowledge check state */
  protected readonly kcStates = signal<Record<string, KnowledgeCheckState>>({});
  /** quiz blockId → current run-through state. */
  protected readonly quizStates = signal<Record<string, QuizRunState>>({});
  /**
   * blockId → correctness of the very first attempt (sticky across retries).
   * Knowledge checks and quizzes share this map: a quiz records its
   * first-run pass/fail under its block id.
   */
  private readonly firstAttempts = signal<Record<string, boolean>>({});

  constructor() {
    // Reset answer state and re-announce the aggregate whenever the lesson
    // input changes, so hosts always know the per-lesson totals.
    effect(() => {
      const lesson = this.lesson();
      untracked(() => {
        this.kcStates.set({});
        this.firstAttempts.set({});
        const quizzes: Record<string, QuizRunState> = {};
        for (const block of lesson.blocks) {
          if (block.kind === 'quiz') quizzes[block.id] = this.freshQuizRun(block, 1);
        }
        this.quizStates.set(quizzes);
        this.checksState.emit(this.aggregateChecksState(lesson));
      });
    });
  }

  /** Sanitize (allowlist) then trust, so target/rel on links survive binding. */
  protected html(raw: string): SafeHtml {
    let safe = this.htmlCache.get(raw);
    if (!safe) {
      safe = this.domSanitizer.bypassSecurityTrustHtml(sanitizeHtml(raw));
      this.htmlCache.set(raw, safe);
    }
    return safe;
  }

  /** YouTube/Vimeo page URL → player embed URL, or null for direct files. */
  protected videoEmbedUrl(url: string): SafeResourceUrl | null {
    const youtube =
      /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
    if (youtube) return this.trustResource(`https://www.youtube-nocookie.com/embed/${youtube[1]}`);
    const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
    if (vimeo) return this.trustResource(`https://player.vimeo.com/video/${vimeo[1]}`);
    return null;
  }

  /** Generic embeds: https only, rendered inside a sandboxed iframe. */
  protected embedUrl(url: string): SafeResourceUrl | null {
    if (!/^https?:\/\//i.test(url.trim())) return null;
    return this.trustResource(url.trim());
  }

  private trustResource(url: string): SafeResourceUrl {
    let safe = this.resourceCache.get(url);
    if (!safe) {
      safe = this.domSanitizer.bypassSecurityTrustResourceUrl(url);
      this.resourceCache.set(url, safe);
    }
    return safe;
  }

  // ---- Accordion -----------------------------------------------------------

  protected isPanelOpen(block: AccordionBlock, itemId: string): boolean {
    return !!this.openPanels()[`${block.id}:${itemId}`];
  }

  protected togglePanel(block: AccordionBlock, itemId: string): void {
    const key = `${block.id}:${itemId}`;
    this.openPanels.update((state) => ({ ...state, [key]: !state[key] }));
  }

  // ---- Tabs ----------------------------------------------------------------

  protected activeTab(block: TabsBlock): string | undefined {
    return this.activeTabs()[block.id] ?? block.items[0]?.id;
  }

  protected selectTab(block: TabsBlock, itemId: string): void {
    this.activeTabs.update((state) => ({ ...state, [block.id]: itemId }));
  }

  // ---- Flashcards ----------------------------------------------------------

  protected isFlipped(block: FlashcardsBlock, cardId: string): boolean {
    return !!this.flippedCards()[`${block.id}:${cardId}`];
  }

  protected flipCard(block: FlashcardsBlock, cardId: string): void {
    const key = `${block.id}:${cardId}`;
    this.flippedCards.update((state) => ({ ...state, [key]: !state[key] }));
  }

  // ---- Knowledge check -----------------------------------------------------

  protected kcState(block: KnowledgeCheckBlock): KnowledgeCheckState {
    return this.kcStates()[block.id] ?? EMPTY_KC_STATE;
  }

  protected selectOption(block: KnowledgeCheckBlock, optionId: string): void {
    const current = this.kcState(block);
    if (current.result !== null) return;
    let selected: string[];
    if (block.type === 'multi_select') {
      selected = current.selected.includes(optionId)
        ? current.selected.filter((id) => id !== optionId)
        : [...current.selected, optionId];
    } else {
      selected = [optionId];
    }
    this.kcStates.update((state) => ({ ...state, [block.id]: { selected, result: null } }));
  }

  protected checkAnswer(block: KnowledgeCheckBlock): void {
    const { selected } = this.kcState(block);
    if (!selected.length) return;
    const correctIds = block.options.filter((option) => option.correct).map((option) => option.id);
    const isCorrect =
      selected.length === correctIds.length && correctIds.every((id) => selected.includes(id));
    this.kcStates.update((state) => ({
      ...state,
      [block.id]: { selected, result: isCorrect ? 'correct' : 'incorrect' },
    }));
    const firstAttempt = !(block.id in this.firstAttempts());
    if (firstAttempt) {
      this.firstAttempts.update((state) => ({ ...state, [block.id]: isCorrect }));
    }
    this.checkAnswered.emit({ blockId: block.id, correct: isCorrect, firstAttempt });
    // Aggregate counts only move on first attempts (retries never re-score).
    if (firstAttempt) this.checksState.emit(this.aggregateChecksState(this.lesson()));
  }

  protected resetCheck(block: KnowledgeCheckBlock): void {
    this.kcStates.update((state) => ({ ...state, [block.id]: { selected: [], result: null } }));
  }

  protected isSelected(block: KnowledgeCheckBlock, optionId: string): boolean {
    return this.kcState(block).selected.includes(optionId);
  }

  // ---- Quiz ----------------------------------------------------------------

  /** Builds a fresh run-through: shuffles as configured, clears all answers. */
  private freshQuizRun(block: QuizBlock, attempt: number): QuizRunState {
    const ids = block.questions.map((question) => question.id);
    const answers: Record<string, QuizAnswerState> = {};
    const rightsOrder: Record<string, string[]> = {};
    for (const question of block.questions) {
      answers[question.id] = {
        selected: [],
        // Ordering questions never start out already solved.
        order:
          question.type === 'ordering'
            ? shuffledAwayFrom(question.items.map((item) => item.id))
            : [],
        matches: {},
        text: '',
        result: null,
      };
      if (question.type === 'matching') {
        rightsOrder[question.id] = shuffled(question.pairs.map((pair) => pair.id));
      }
    }
    return {
      sequence: block.shuffleQuestions ? shuffled(ids) : ids,
      index: 0,
      answers,
      rightsOrder,
      attempt,
    };
  }

  protected quizState(block: QuizBlock): QuizRunState | undefined {
    return this.quizStates()[block.id];
  }

  /** The question being presented, or null on the results screen. */
  protected quizCurrentQuestion(block: QuizBlock): QuizQuestion | null {
    const state = this.quizState(block);
    if (!state || state.index >= state.sequence.length) return null;
    const id = state.sequence[state.index];
    return block.questions.find((question) => question.id === id) ?? null;
  }

  protected quizAnswer(block: QuizBlock, questionId: string): QuizAnswerState | undefined {
    return this.quizState(block)?.answers[questionId];
  }

  /** Has the current question been checked (feedback showing)? */
  protected quizChecked(block: QuizBlock, question: QuizQuestion): boolean {
    return (this.quizAnswer(block, question.id)?.result ?? null) !== null;
  }

  /** The checked result of one question (null while unchecked). */
  protected quizResultOf(block: QuizBlock, question: QuizQuestion): boolean | null {
    return this.quizAnswer(block, question.id)?.result ?? null;
  }

  protected quizAnswerable(block: QuizBlock, question: QuizQuestion): boolean {
    const answer = this.quizAnswer(block, question.id);
    return !!answer && isQuestionAnswerable(question, answer);
  }

  protected quizIsSelected(block: QuizBlock, question: QuizQuestion, value: string): boolean {
    return this.quizAnswer(block, question.id)?.selected.includes(value) ?? false;
  }

  /** mcq/true_false pick one; multi_select toggles. Locked once checked. */
  protected quizSelect(block: QuizBlock, question: QuizQuestion, value: string): void {
    this.updateQuizAnswer(block, question.id, (answer) => {
      if (answer.result !== null) return answer;
      const selected =
        question.type === 'multi_select'
          ? answer.selected.includes(value)
            ? answer.selected.filter((id) => id !== value)
            : [...answer.selected, value]
          : [value];
      return { ...answer, selected };
    });
  }

  /** Ordering: nudge the item at `index` up (-1) or down (+1). */
  protected quizMoveItem(
    block: QuizBlock,
    question: OrderingQuestion,
    index: number,
    delta: -1 | 1,
  ): void {
    this.updateQuizAnswer(block, question.id, (answer) => {
      if (answer.result !== null) return answer;
      const target = index + delta;
      if (target < 0 || target >= answer.order.length) return answer;
      const order = answer.order.slice();
      [order[index], order[target]] = [order[target], order[index]];
      return { ...answer, order };
    });
  }

  /** Ordering: resolve the item ids in the learner's current order. */
  protected quizOrderedItems(
    block: QuizBlock,
    question: OrderingQuestion,
  ): OrderingQuestion['items'] {
    const order = this.quizAnswer(block, question.id)?.order ?? [];
    return order
      .map((id) => question.items.find((item) => item.id === id))
      .filter((item): item is OrderingQuestion['items'][number] => !!item);
  }

  /** Matching: the right-side pairs in this run's shuffled column order. */
  protected quizShuffledRights(
    block: QuizBlock,
    question: MatchingQuestion,
  ): MatchingQuestion['pairs'] {
    const order = this.quizState(block)?.rightsOrder[question.id] ?? [];
    return order
      .map((id) => question.pairs.find((pair) => pair.id === id))
      .filter((pair): pair is MatchingQuestion['pairs'][number] => !!pair);
  }

  protected quizMatchOf(block: QuizBlock, question: QuizQuestion, pairId: string): string {
    return this.quizAnswer(block, question.id)?.matches[pairId] ?? '';
  }

  protected quizSetMatch(
    block: QuizBlock,
    question: MatchingQuestion,
    pairId: string,
    event: Event,
  ): void {
    const value = (event.target as HTMLSelectElement).value;
    this.updateQuizAnswer(block, question.id, (answer) => {
      if (answer.result !== null) return answer;
      return { ...answer, matches: { ...answer.matches, [pairId]: value } };
    });
  }

  protected quizSetText(block: QuizBlock, question: QuizQuestion, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateQuizAnswer(block, question.id, (answer) =>
      answer.result !== null ? answer : { ...answer, text: value },
    );
  }

  /** Scores the current question and reveals its feedback. */
  protected quizCheck(block: QuizBlock, question: QuizQuestion): void {
    if (!this.quizAnswerable(block, question)) return;
    this.updateQuizAnswer(block, question.id, (answer) =>
      answer.result !== null ? answer : { ...answer, result: scoreQuestion(question, answer) },
    );
  }

  /** Advances to the next question, or finishes the run on the last one. */
  protected quizNext(block: QuizBlock): void {
    const state = this.quizState(block);
    if (!state || state.index >= state.sequence.length) return;
    const nextIndex = state.index + 1;
    this.quizStates.update((all) => ({ ...all, [block.id]: { ...state, index: nextIndex } }));
    if (nextIndex >= state.sequence.length) this.finishQuizRun(block);
  }

  protected quizFinished(block: QuizBlock): boolean {
    const state = this.quizState(block);
    return !!state && state.index >= state.sequence.length;
  }

  /** Per-question review entries for the results screen, in authored order. */
  protected quizReview(block: QuizBlock): { question: QuizQuestion; correct: boolean }[] {
    const state = this.quizState(block);
    return block.questions.map((question) => ({
      question,
      correct: state?.answers[question.id]?.result === true,
    }));
  }

  protected quizScoreOf(block: QuizBlock): number {
    return quizScore(this.quizReview(block).map((entry) => entry.correct));
  }

  protected quizPassedOf(block: QuizBlock): boolean {
    return quizPassed(this.quizScoreOf(block), block.passingScore);
  }

  /** Starts a new run-through; reshuffles questions when configured. */
  protected quizRetake(block: QuizBlock): void {
    const attempt = (this.quizState(block)?.attempt ?? 1) + 1;
    this.quizStates.update((all) => ({ ...all, [block.id]: this.freshQuizRun(block, attempt) }));
  }

  /** Emits the quiz outcome as one check: correct == passed. */
  private finishQuizRun(block: QuizBlock): void {
    const passed = this.quizPassedOf(block);
    const firstAttempt = !(block.id in this.firstAttempts());
    if (firstAttempt) {
      this.firstAttempts.update((state) => ({ ...state, [block.id]: passed }));
    }
    this.checkAnswered.emit({ blockId: block.id, correct: passed, firstAttempt });
    if (firstAttempt) this.checksState.emit(this.aggregateChecksState(this.lesson()));
  }

  private updateQuizAnswer(
    block: QuizBlock,
    questionId: string,
    mutate: (answer: QuizAnswerState) => QuizAnswerState,
  ): void {
    const state = this.quizStates()[block.id];
    const answer = state?.answers[questionId];
    if (!state || !answer) return;
    const next = mutate(answer);
    if (next === answer) return;
    this.quizStates.update((all) => ({
      ...all,
      [block.id]: { ...state, answers: { ...state.answers, [questionId]: next } },
    }));
  }

  /**
   * SCORM completion counts as one check: correct == passed (or completed when
   * the package reports no pass/fail). Only the first completion scores.
   */
  protected onScormStatus(block: ScormBlock, status: ScormStatusChange): void {
    if (!status.completed) return;
    const firstAttempt = !(block.id in this.firstAttempts());
    const correct = status.passed ?? true;
    if (firstAttempt) {
      this.firstAttempts.update((state) => ({ ...state, [block.id]: correct }));
    }
    this.checkAnswered.emit({ blockId: block.id, correct, firstAttempt });
    if (firstAttempt) this.checksState.emit(this.aggregateChecksState(this.lesson()));
  }

  private aggregateChecksState(lesson: LessonDraft): ChecksStateEvent {
    const total = lesson.blocks.filter(
      (block) =>
        block.kind === 'knowledgeCheck' ||
        block.kind === 'quiz' ||
        // Unconfigured SCORM blocks (no launch URL) can never complete, so
        // they must not gate lesson completion.
        (block.kind === 'scorm' && block.url.length > 0),
    ).length;
    const outcomes = Object.values(this.firstAttempts());
    return {
      total,
      answered: outcomes.length,
      correctOnFirstAttempt: outcomes.filter(Boolean).length,
    };
  }
}
