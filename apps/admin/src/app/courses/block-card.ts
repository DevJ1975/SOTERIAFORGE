import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import type {
  Flashcard,
  KnowledgeCheckBlock,
  KnowledgeCheckOption,
  KnowledgeCheckType,
  QuestionType,
  QuizBlock,
  RichTextItem,
} from '@forge/shared';
import type { Block } from '@forge/shared';
import { createId } from '@forge/lms-core';
import { BuilderStore } from './builder-store';
import { blockDef } from './block-defs';
import { RichTextEditor } from './rich-text-editor';

/**
 * One editable block on the Forge Studio canvas: drag handle, hover/selected
 * toolbar (move/duplicate/delete), ember selection outline, and in-place
 * editors per block kind. Media/config-heavy kinds (image, video, button,
 * embed) render a live preview and defer settings to the inspector.
 */
@Component({
  selector: 'app-block-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDragHandle, RichTextEditor],
  templateUrl: './block-card.html',
  styleUrl: './block-card.scss',
  host: {
    '[class.selected]': 'isSelected()',
    '(click)': 'onSelect($event)',
  },
})
export class BlockCard {
  readonly block = input.required<Block>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();

  protected readonly store = inject(BuilderStore);
  private readonly domSanitizer = inject(DomSanitizer);
  private readonly resourceCache = new Map<string, SafeResourceUrl>();

  protected readonly isSelected = computed(() => this.store.selectedBlockId() === this.block().id);
  protected readonly kindLabel = computed(() => blockDef(this.block().kind).label);

  /** Which tab panel is being edited in a tabs block. */
  protected readonly activeTabIndex = signal(0);

  protected onSelect(event: Event): void {
    event.stopPropagation();
    this.store.selectBlock(this.block().id);
  }

  protected patch(patch: Record<string, unknown>, label: string): void {
    this.store.patchBlock(this.block().id, patch, label);
  }

  /** Keep single-line contenteditables single-line: Enter commits via blur. */
  protected singleLine(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    }
  }

  protected commitText(field: string, event: Event, label: string): void {
    const target = event.target as HTMLElement;
    const text =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? target.value
        : (target.textContent ?? '').trim();
    this.patch({ [field]: text }, label);
  }

  // ---- Video preview ---------------------------------------------------------

  protected videoEmbedUrl(url: string): SafeResourceUrl | null {
    const youtube =
      /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
    const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
    const resolved = youtube
      ? `https://www.youtube-nocookie.com/embed/${youtube[1]}`
      : vimeo
        ? `https://player.vimeo.com/video/${vimeo[1]}`
        : null;
    if (!resolved) return null;
    let safe = this.resourceCache.get(resolved);
    if (!safe) {
      safe = this.domSanitizer.bypassSecurityTrustResourceUrl(resolved);
      this.resourceCache.set(resolved, safe);
    }
    return safe;
  }

  // ---- Plain string lists ------------------------------------------------------

  protected commitListItem(items: string[], index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const next = items.slice();
    next[index] = value;
    this.patch({ items: next }, 'Edit list item');
  }

  protected addListItem(items: string[]): void {
    this.patch({ items: [...items, ''] }, 'Add list item');
  }

  protected removeListItem(items: string[], index: number): void {
    this.patch({ items: items.filter((_, i) => i !== index) }, 'Remove list item');
  }

  // ---- Accordion / tabs items -----------------------------------------------------

  protected commitItemTitle(items: RichTextItem[], index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const next = items.map((item, i) => (i === index ? { ...item, title: value } : item));
    this.patch({ items: next }, 'Rename section');
  }

  protected commitItemHtml(items: RichTextItem[], index: number, html: string): void {
    const next = items.map((item, i) => (i === index ? { ...item, html } : item));
    this.patch({ items: next }, 'Edit section content');
  }

  protected addRichItem(items: RichTextItem[], title: string): void {
    this.patch({ items: [...items, { id: createId('item'), title, html: '' }] }, 'Add section');
  }

  protected removeRichItem(items: RichTextItem[], index: number): void {
    this.patch({ items: items.filter((_, i) => i !== index) }, 'Remove section');
  }

  protected addTab(items: RichTextItem[]): void {
    this.addRichItem(items, `Tab ${items.length + 1}`);
    this.activeTabIndex.set(items.length);
  }

  protected removeTab(items: RichTextItem[]): void {
    const index = this.activeTabIndex();
    this.removeRichItem(items, index);
    this.activeTabIndex.set(Math.max(0, Math.min(index, items.length - 2)));
  }

  // ---- Flashcards -------------------------------------------------------------------

  protected commitCard(
    cards: Flashcard[],
    index: number,
    side: 'front' | 'back',
    event: Event,
  ): void {
    const value = (event.target as HTMLTextAreaElement).value;
    const next = cards.map((card, i) => (i === index ? { ...card, [side]: value } : card));
    this.patch({ cards: next }, 'Edit flashcard');
  }

  protected addCard(cards: Flashcard[]): void {
    this.patch(
      { cards: [...cards, { id: createId('card'), front: '', back: '' }] },
      'Add flashcard',
    );
  }

  protected removeCard(cards: Flashcard[], index: number): void {
    this.patch({ cards: cards.filter((_, i) => i !== index) }, 'Remove flashcard');
  }

  // ---- Knowledge check -----------------------------------------------------------------

  protected kcTypeLabel(type: KnowledgeCheckType): string {
    switch (type) {
      case 'mcq':
        return 'Multiple choice';
      case 'multi_select':
        return 'Multi-select';
      case 'true_false':
        return 'True / False';
    }
  }

  protected toggleCorrect(block: KnowledgeCheckBlock, index: number): void {
    const next = block.options.map((option, i) => {
      if (block.type === 'multi_select') {
        return i === index ? { ...option, correct: !option.correct } : option;
      }
      return { ...option, correct: i === index };
    });
    this.patch({ options: next }, 'Set correct answer');
  }

  protected commitOptionText(options: KnowledgeCheckOption[], index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const next = options.map((option, i) => (i === index ? { ...option, text: value } : option));
    this.patch({ options: next }, 'Edit answer option');
  }

  protected addOption(options: KnowledgeCheckOption[]): void {
    this.patch(
      { options: [...options, { id: createId('opt'), text: '', correct: false }] },
      'Add answer option',
    );
  }

  protected removeOption(options: KnowledgeCheckOption[], index: number): void {
    if (options.length <= 2) return;
    this.patch({ options: options.filter((_, i) => i !== index) }, 'Remove answer option');
  }

  // ---- Quiz -------------------------------------------------------------------------------

  protected quizTypeLabel(type: QuestionType): string {
    switch (type) {
      case 'mcq':
        return 'Multiple choice';
      case 'multi_select':
        return 'Multi-select';
      case 'true_false':
        return 'True / False';
      case 'ordering':
        return 'Ordering';
      case 'matching':
        return 'Matching';
      case 'fill_in':
        return 'Fill in the blank';
    }
  }

  /** Question-count chips grouped by type, in QUESTION_TYPES order of appearance. */
  protected quizTypeCounts(block: QuizBlock): { type: QuestionType; count: number }[] {
    const counts = new Map<QuestionType, number>();
    for (const question of block.questions) {
      counts.set(question.type, (counts.get(question.type) ?? 0) + 1);
    }
    return [...counts.entries()].map(([type, count]) => ({ type, count }));
  }
}
