import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import type {
  BlockKind,
  KnowledgeCheckBlock,
  KnowledgeCheckType,
  McqQuestion,
  MultiSelectQuestion,
  QuestionType,
  QuizBlock,
  QuizQuestion,
} from '@forge/shared';
import {
  BUTTON_STYLES,
  CALLOUT_TONES,
  DIVIDER_STYLES,
  IMAGE_LAYOUTS,
  KNOWLEDGE_CHECK_TYPES,
  QUESTION_TYPES,
} from '@forge/shared';
import { createId } from '@forge/lms-core';
import { BuilderStore } from './builder-store';
import { blockDef } from './block-defs';
import { MediaUploadButton } from './media-upload-button';

/**
 * Right rail: kind-specific settings for the selected block, or lesson/course
 * settings when nothing is selected.
 */
@Component({
  selector: 'app-block-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, InputTextModule, SelectModule, MediaUploadButton],
  templateUrl: './block-inspector.html',
  styleUrl: './block-inspector.scss',
})
export class BlockInspector {
  protected readonly store = inject(BuilderStore);

  protected readonly headingLevels = [1, 2, 3] as const;
  protected readonly imageLayouts = IMAGE_LAYOUTS;
  protected readonly calloutTones = CALLOUT_TONES;
  protected readonly dividerStyles = DIVIDER_STYLES;
  protected readonly buttonStyles = BUTTON_STYLES;
  protected readonly scormVersionOptions: { label: string; value: '1.2' | '2004' }[] = [
    { label: 'SCORM 1.2', value: '1.2' },
    { label: 'SCORM 2004', value: '2004' },
  ];

  protected readonly kcTypeOptions: { label: string; value: KnowledgeCheckType }[] = [
    { label: 'Multiple choice (one answer)', value: 'mcq' },
    { label: 'Multi-select (several answers)', value: 'multi_select' },
    { label: 'True / False', value: 'true_false' },
  ];

  protected kindLabel(kind: BlockKind): string {
    return blockDef(kind).label;
  }

  protected patch(id: string, patch: Record<string, unknown>, label: string): void {
    this.store.patchBlock(id, patch, label);
  }

  protected patchInput(id: string, field: string, event: Event, label: string): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.store.patchBlock(id, { [field]: value }, label);
  }

  protected patchNumber(id: string, field: string, event: Event, label: string): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    const value = Math.max(80, Math.min(2000, Math.round(raw)));
    this.store.patchBlock(id, { [field]: value }, label);
  }

  /**
   * Changing the question type adjusts options sensibly: true/false swaps in
   * a True/False pair; switching away from multi-select keeps only the first
   * correct answer.
   */
  protected changeKcType(block: KnowledgeCheckBlock, type: KnowledgeCheckType): void {
    if (!KNOWLEDGE_CHECK_TYPES.includes(type) || type === block.type) return;
    let options = block.options;
    if (type === 'true_false') {
      options = [
        { id: createId('opt'), text: 'True', correct: true },
        { id: createId('opt'), text: 'False', correct: false },
      ];
    } else if (type === 'mcq') {
      let seen = false;
      options = block.options.map((option) => {
        const correct = option.correct && !seen;
        if (option.correct) seen = true;
        return { ...option, correct };
      });
    }
    this.store.patchBlock(block.id, { type, options }, 'Change question type');
  }

  protected renameLesson(lessonId: string, event: Event): void {
    this.store.renameLesson(lessonId, (event.target as HTMLInputElement).value);
  }

  protected setDescription(event: Event): void {
    this.store.setDescription((event.target as HTMLTextAreaElement).value);
  }

  protected setCoverImageInput(event: Event): void {
    this.setCoverImage((event.target as HTMLInputElement).value);
  }

  /**
   * Cover image changes go through the builder store's commit gateway, the
   * same path as every block edit, so undo and autosave keep working.
   */
  protected setCoverImage(url: string): void {
    const value = url.trim();
    if (value === (this.store.course()?.coverImageUrl ?? '')) return;
    this.store.commit('Set cover image', (draft) => {
      if (value) draft.coverImageUrl = value;
      else delete draft.coverImageUrl;
    });
  }

  // ---- Quiz ------------------------------------------------------------------
  //
  // All quiz edits flow through store.patchBlock (→ commit gateway), replacing
  // the questions array immutably so undo and autosave keep working.

  protected readonly quizTypeOptions: { label: string; value: QuestionType }[] = [
    { label: 'Multiple choice (one answer)', value: 'mcq' },
    { label: 'Multi-select (several answers)', value: 'multi_select' },
    { label: 'True / False', value: 'true_false' },
    { label: 'Ordering (arrange items)', value: 'ordering' },
    { label: 'Matching (pair up items)', value: 'matching' },
    { label: 'Fill in the blank', value: 'fill_in' },
  ];

  /** Index of the question expanded in the inspector list (-1 = none). */
  protected readonly expandedQuestion = signal(0);

  protected quizTypeLabel(type: QuestionType): string {
    return this.quizTypeOptions.find((option) => option.value === type)?.label ?? type;
  }

  protected toggleQuestion(index: number): void {
    this.expandedQuestion.update((current) => (current === index ? -1 : index));
  }

  protected setQuizPassingScore(block: QuizBlock, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    const passingScore = Math.max(0, Math.min(100, Math.round(raw)));
    (event.target as HTMLInputElement).value = String(passingScore);
    this.store.patchBlock(block.id, { passingScore }, 'Set passing score');
  }

  protected setQuizShuffle(block: QuizBlock, shuffleQuestions: boolean): void {
    this.store.patchBlock(block.id, { shuffleQuestions }, 'Toggle question shuffle');
  }

  private patchQuestions(block: QuizBlock, questions: QuizQuestion[], label: string): void {
    this.store.patchBlock(block.id, { questions }, label);
  }

  private replaceQuestion(
    block: QuizBlock,
    index: number,
    question: QuizQuestion,
    label: string,
  ): void {
    const questions = block.questions.map((existing, i) => (i === index ? question : existing));
    this.patchQuestions(block, questions, label);
  }

  protected addQuizQuestion(block: QuizBlock): void {
    const correctId = createId('opt');
    const question: McqQuestion = {
      id: createId('q'),
      type: 'mcq',
      prompt: '',
      options: [
        { id: correctId, text: 'Correct answer' },
        { id: createId('opt'), text: 'Distractor' },
        { id: createId('opt'), text: 'Another distractor' },
      ],
      correctOptionId: correctId,
    };
    this.patchQuestions(block, [...block.questions, question], 'Add quiz question');
    this.expandedQuestion.set(block.questions.length);
  }

  protected removeQuizQuestion(block: QuizBlock, index: number): void {
    if (block.questions.length <= 1) return;
    this.patchQuestions(
      block,
      block.questions.filter((_, i) => i !== index),
      'Remove quiz question',
    );
    this.expandedQuestion.update((current) =>
      current === index ? -1 : current > index ? current - 1 : current,
    );
  }

  protected moveQuizQuestion(block: QuizBlock, index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= block.questions.length) return;
    const questions = block.questions.slice();
    [questions[index], questions[target]] = [questions[target], questions[index]];
    this.patchQuestions(block, questions, 'Reorder quiz questions');
    this.expandedQuestion.update((current) =>
      current === index ? target : current === target ? index : current,
    );
  }

  /**
   * Changing a question's type keeps the prompt/explanation and converts the
   * answer payload sensibly: option-based types share their option list;
   * everything else gets a fresh, valid default payload.
   */
  protected changeQuizQuestionType(block: QuizBlock, index: number, type: QuestionType): void {
    const question = block.questions[index];
    if (!question || !QUESTION_TYPES.includes(type) || question.type === type) return;
    const base = { id: question.id, prompt: question.prompt, explanation: question.explanation };
    const carriedOptions =
      'options' in question && question.options.length >= 2
        ? question.options.map((option) => ({ ...option }))
        : [
            { id: createId('opt'), text: 'First option' },
            { id: createId('opt'), text: 'Second option' },
          ];
    let next: QuizQuestion;
    switch (type) {
      case 'mcq':
        next = { ...base, type, options: carriedOptions, correctOptionId: carriedOptions[0].id };
        break;
      case 'multi_select':
        next = { ...base, type, options: carriedOptions, correctOptionIds: [carriedOptions[0].id] };
        break;
      case 'true_false':
        next = { ...base, type, correct: true };
        break;
      case 'ordering':
        next = { ...base, type, items: carriedOptions };
        break;
      case 'matching':
        next = {
          ...base,
          type,
          pairs: [
            { id: createId('pair'), left: '', right: '' },
            { id: createId('pair'), left: '', right: '' },
          ],
        };
        break;
      case 'fill_in':
        next = { ...base, type, acceptedAnswers: ['Answer'] };
        break;
    }
    if (next.explanation === undefined) delete next.explanation;
    this.replaceQuestion(block, index, next, 'Change question type');
  }

  protected setQuizQuestionText(
    block: QuizBlock,
    index: number,
    field: 'prompt' | 'explanation',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    const question = block.questions[index];
    if (!question) return;
    const next: QuizQuestion =
      field === 'prompt'
        ? { ...question, prompt: value }
        : { ...question, explanation: value.trim() ? value : undefined };
    if (next.explanation === undefined) delete next.explanation;
    this.replaceQuestion(
      block,
      index,
      next,
      field === 'prompt' ? 'Edit prompt' : 'Edit explanation',
    );
  }

  // -- mcq / multi_select options

  protected setQuizOptionText(
    block: QuizBlock,
    index: number,
    optionIndex: number,
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    const question = block.questions[index];
    if (!question || !('options' in question)) return;
    const options = question.options.map((option, i) =>
      i === optionIndex ? { ...option, text: value } : option,
    );
    this.replaceQuestion(block, index, { ...question, options }, 'Edit answer option');
  }

  protected addQuizOption(block: QuizBlock, index: number): void {
    const question = block.questions[index];
    if (!question || !('options' in question)) return;
    const options = [...question.options, { id: createId('opt'), text: '' }];
    this.replaceQuestion(block, index, { ...question, options }, 'Add answer option');
  }

  /** Removes an option (min 2) and repairs the correct-id references. */
  protected removeQuizOption(block: QuizBlock, index: number, optionIndex: number): void {
    const question = block.questions[index];
    if (!question || !('options' in question) || question.options.length <= 2) return;
    const removed = question.options[optionIndex];
    const options = question.options.filter((_, i) => i !== optionIndex);
    let next: McqQuestion | MultiSelectQuestion;
    if (question.type === 'mcq') {
      next = {
        ...question,
        options,
        correctOptionId:
          question.correctOptionId === removed.id ? options[0].id : question.correctOptionId,
      };
    } else {
      const correctOptionIds = question.correctOptionIds.filter((id) => id !== removed.id);
      next = {
        ...question,
        options,
        correctOptionIds: correctOptionIds.length > 0 ? correctOptionIds : [options[0].id],
      };
    }
    this.replaceQuestion(block, index, next, 'Remove answer option');
  }

  protected setQuizCorrectOption(block: QuizBlock, index: number, optionId: string): void {
    const question = block.questions[index];
    if (question?.type !== 'mcq') return;
    this.replaceQuestion(
      block,
      index,
      { ...question, correctOptionId: optionId },
      'Set correct answer',
    );
  }

  /** Toggles a multi-select correct option; the last one can't be unchecked. */
  protected toggleQuizCorrectOption(block: QuizBlock, index: number, optionId: string): void {
    const question = block.questions[index];
    if (question?.type !== 'multi_select') return;
    const has = question.correctOptionIds.includes(optionId);
    if (has && question.correctOptionIds.length <= 1) return;
    const correctOptionIds = has
      ? question.correctOptionIds.filter((id) => id !== optionId)
      : [...question.correctOptionIds, optionId];
    this.replaceQuestion(block, index, { ...question, correctOptionIds }, 'Set correct answers');
  }

  // -- true / false

  protected setQuizTrueFalse(block: QuizBlock, index: number, correct: boolean): void {
    const question = block.questions[index];
    if (question?.type !== 'true_false' || question.correct === correct) return;
    this.replaceQuestion(block, index, { ...question, correct }, 'Set correct answer');
  }

  // -- ordering items (authored in the correct order)

  protected setQuizItemText(
    block: QuizBlock,
    index: number,
    itemIndex: number,
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    const question = block.questions[index];
    if (question?.type !== 'ordering') return;
    const items = question.items.map((item, i) =>
      i === itemIndex ? { ...item, text: value } : item,
    );
    this.replaceQuestion(block, index, { ...question, items }, 'Edit ordering item');
  }

  protected addQuizItem(block: QuizBlock, index: number): void {
    const question = block.questions[index];
    if (question?.type !== 'ordering') return;
    const items = [...question.items, { id: createId('item'), text: '' }];
    this.replaceQuestion(block, index, { ...question, items }, 'Add ordering item');
  }

  protected removeQuizItem(block: QuizBlock, index: number, itemIndex: number): void {
    const question = block.questions[index];
    if (question?.type !== 'ordering' || question.items.length <= 2) return;
    const items = question.items.filter((_, i) => i !== itemIndex);
    this.replaceQuestion(block, index, { ...question, items }, 'Remove ordering item');
  }

  protected moveQuizItem(block: QuizBlock, index: number, itemIndex: number, delta: -1 | 1): void {
    const question = block.questions[index];
    if (question?.type !== 'ordering') return;
    const target = itemIndex + delta;
    if (target < 0 || target >= question.items.length) return;
    const items = question.items.slice();
    [items[itemIndex], items[target]] = [items[target], items[itemIndex]];
    this.replaceQuestion(block, index, { ...question, items }, 'Reorder items');
  }

  // -- matching pairs

  protected setQuizPairText(
    block: QuizBlock,
    index: number,
    pairIndex: number,
    side: 'left' | 'right',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    const question = block.questions[index];
    if (question?.type !== 'matching') return;
    const pairs = question.pairs.map((pair, i) =>
      i === pairIndex ? { ...pair, [side]: value } : pair,
    );
    this.replaceQuestion(block, index, { ...question, pairs }, 'Edit matching pair');
  }

  protected addQuizPair(block: QuizBlock, index: number): void {
    const question = block.questions[index];
    if (question?.type !== 'matching') return;
    const pairs = [...question.pairs, { id: createId('pair'), left: '', right: '' }];
    this.replaceQuestion(block, index, { ...question, pairs }, 'Add matching pair');
  }

  protected removeQuizPair(block: QuizBlock, index: number, pairIndex: number): void {
    const question = block.questions[index];
    if (question?.type !== 'matching' || question.pairs.length <= 2) return;
    const pairs = question.pairs.filter((_, i) => i !== pairIndex);
    this.replaceQuestion(block, index, { ...question, pairs }, 'Remove matching pair');
  }

  // -- fill-in accepted answers

  protected addQuizAnswer(block: QuizBlock, index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    const question = block.questions[index];
    if (!value || question?.type !== 'fill_in') return;
    input.value = '';
    if (question.acceptedAnswers.includes(value)) return;
    this.replaceQuestion(
      block,
      index,
      { ...question, acceptedAnswers: [...question.acceptedAnswers, value] },
      'Add accepted answer',
    );
  }

  protected removeQuizAnswer(block: QuizBlock, index: number, answerIndex: number): void {
    const question = block.questions[index];
    if (question?.type !== 'fill_in' || question.acceptedAnswers.length <= 1) return;
    const acceptedAnswers = question.acceptedAnswers.filter((_, i) => i !== answerIndex);
    this.replaceQuestion(block, index, { ...question, acceptedAnswers }, 'Remove accepted answer');
  }
}
