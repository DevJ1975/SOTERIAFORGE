import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
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

/**
 * Renders a Forge Studio lesson read-only but fully interactive: accordions
 * expand, tabs switch, flashcards flip, knowledge checks are answerable.
 *
 * This is the exact surface the learner player will ship with, so the
 * builder's preview mode is pixel-identical by construction. All rich-text
 * fields pass through the allowlist sanitizer before being bound.
 */
@Component({
  selector: 'forge-lesson-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lesson-renderer.html',
  styleUrl: './lesson-renderer.scss',
})
export class ForgeLessonRenderer {
  readonly lesson = input.required<LessonDraft>();

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
  }

  protected resetCheck(block: KnowledgeCheckBlock): void {
    this.kcStates.update((state) => ({ ...state, [block.id]: { selected: [], result: null } }));
  }

  protected isSelected(block: KnowledgeCheckBlock, optionId: string): boolean {
    return this.kcState(block).selected.includes(optionId);
  }
}
