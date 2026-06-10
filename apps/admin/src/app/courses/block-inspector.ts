import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import type { BlockKind, KnowledgeCheckBlock, KnowledgeCheckType } from '@forge/shared';
import {
  BUTTON_STYLES,
  CALLOUT_TONES,
  DIVIDER_STYLES,
  IMAGE_LAYOUTS,
  KNOWLEDGE_CHECK_TYPES,
} from '@forge/shared';
import { createId } from '@forge/lms-core';
import { BuilderStore } from './builder-store';
import { blockDef } from './block-defs';

/**
 * Right rail: kind-specific settings for the selected block, or lesson/course
 * settings when nothing is selected.
 */
@Component({
  selector: 'app-block-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, InputTextModule, SelectModule],
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
}
