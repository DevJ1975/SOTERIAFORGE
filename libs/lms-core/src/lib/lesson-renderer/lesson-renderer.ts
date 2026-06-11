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
  TabsBlock,
} from '@forge/shared';
import { sanitizeHtml } from '../sanitize-html';

interface KnowledgeCheckState {
  selected: string[];
  result: 'correct' | 'incorrect' | null;
}

const EMPTY_KC_STATE: KnowledgeCheckState = { selected: [], result: null };

/** Emitted every time a knowledge check is checked (not on retry-reset). */
export interface CheckAnsweredEvent {
  blockId: string;
  correct: boolean;
  /** True only for the first check of a block; retries re-emit with false. */
  firstAttempt: boolean;
}

/** Aggregate knowledge-check state for the current lesson. */
export interface ChecksStateEvent {
  /** Number of knowledgeCheck blocks in the lesson (0 for check-less lessons). */
  total: number;
  /** Blocks answered at least once (retry-resets never decrement this). */
  answered: number;
  /** Blocks answered correctly on their very first attempt. */
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
  /** blockId → correctness of the very first attempt (sticky across retries). */
  private readonly kcFirstAttempts = signal<Record<string, boolean>>({});

  constructor() {
    // Reset answer state and re-announce the aggregate whenever the lesson
    // input changes, so hosts always know the per-lesson totals.
    effect(() => {
      const lesson = this.lesson();
      untracked(() => {
        this.kcStates.set({});
        this.kcFirstAttempts.set({});
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
    const firstAttempt = !(block.id in this.kcFirstAttempts());
    if (firstAttempt) {
      this.kcFirstAttempts.update((state) => ({ ...state, [block.id]: isCorrect }));
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

  private aggregateChecksState(lesson: LessonDraft): ChecksStateEvent {
    const total = lesson.blocks.filter((block) => block.kind === 'knowledgeCheck').length;
    const outcomes = Object.values(this.kcFirstAttempts());
    return {
      total,
      answered: outcomes.length,
      correctOnFirstAttempt: outcomes.filter(Boolean).length,
    };
  }
}
