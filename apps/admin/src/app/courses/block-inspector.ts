import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import type {
  BlockKind,
  KnowledgeCheckBlock,
  KnowledgeCheckType,
  VideoBlock,
} from '@forge/shared';
import {
  BUTTON_STYLES,
  CALLOUT_TONES,
  DIVIDER_STYLES,
  IMAGE_LAYOUTS,
  KNOWLEDGE_CHECK_TYPES,
} from '@forge/shared';
import { createId, VideoAssetService } from '@forge/lms-core';
import { PrincipalStore } from '@forge/auth';
import { BuilderStore } from './builder-store';
import { blockDef } from './block-defs';

/** Which authoring path the video inspector is showing. */
type VideoSource = 'upload' | 'embed';

/** Upload lifecycle for the in-inspector video uploader. */
type UploadStatus = 'idle' | 'uploading' | 'error';

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
  private readonly principal = inject(PrincipalStore);
  private readonly videoAssets = inject(VideoAssetService);

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

  // ---- Video upload state ----------------------------------------------------

  /** Author's chosen tab (upload vs embed); defaults to the block's own state. */
  private readonly videoSourceOverride = signal<VideoSource | null>(null);
  /** Upload progress as a whole percentage 0..100. */
  protected readonly uploadPct = signal(0);
  protected readonly uploadStatus = signal<UploadStatus>('idle');
  protected readonly uploadError = signal<string | null>(null);
  /** Name of the file currently uploading, for the live status line. */
  protected readonly uploadingName = signal<string | null>(null);

  /**
   * The tab to show for the selected video block: an uploaded asset (one with a
   * `storagePath`) defaults to "upload", a legacy external link to "embed",
   * unless the author has explicitly switched tabs.
   */
  protected readonly videoSource = computed<VideoSource>(() => {
    const override = this.videoSourceOverride();
    if (override) return override;
    const block = this.store.selectedBlock();
    if (block?.kind === 'video' && (block as VideoBlock).storagePath) return 'upload';
    return 'embed';
  });

  /** True once the tenant and an open course are both known (upload is possible). */
  protected readonly canUpload = computed(
    () => !!this.principal.tenantId() && !!this.store.course()?.id,
  );

  protected kindLabel(kind: BlockKind): string {
    return blockDef(kind).label;
  }

  /** Narrow a block to the extended video shape for template field access. */
  protected asVideo(block: { kind: string }): VideoBlock {
    return block as VideoBlock;
  }

  /** Human-readable size for an uploaded asset, e.g. "12.4 MB". */
  protected formatBytes(bytes: number | undefined): string {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
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

  // ---- Video source switching + upload --------------------------------------

  protected setVideoSource(source: VideoSource): void {
    this.videoSourceOverride.set(source);
    this.uploadError.set(null);
  }

  /**
   * Read the picked file and upload it via {@link VideoAssetService}, streaming
   * progress (0..1 from the service) into a 0..100 signal. On success, persist
   * the uploaded refs onto the block through the builder store — no schema
   * bypass — so autosave + undo capture them like any other edit.
   */
  protected async onVideoFile(blockId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Allow re-picking the same file later.
    input.value = '';
    if (!file) return;

    const tenantId = this.principal.tenantId();
    const courseId = this.store.course()?.id;
    if (!tenantId || !courseId) {
      this.uploadStatus.set('error');
      this.uploadError.set('Open a course and sign in before uploading a video.');
      return;
    }

    this.uploadStatus.set('uploading');
    this.uploadError.set(null);
    this.uploadingName.set(file.name);
    this.uploadPct.set(0);

    try {
      const result = await this.videoAssets.uploadVideo(tenantId, courseId, file, (pct) =>
        this.uploadPct.set(Math.round(Math.max(0, Math.min(1, pct)) * 100)),
      );
      this.uploadPct.set(100);
      this.store.patchBlock(
        blockId,
        {
          storagePath: result.storagePath,
          url: result.url,
          sizeBytes: result.sizeBytes,
          mimeType: result.mimeType,
        },
        'Upload video',
      );
      this.uploadStatus.set('idle');
      this.uploadingName.set(null);
    } catch (error) {
      console.error('[forge] video upload failed', error);
      this.uploadStatus.set('error');
      this.uploadError.set('Upload failed. Check your connection and try again.');
    }
  }

  /** Clear the uploaded asset, returning the block to an empty/embed state. */
  protected clearUpload(blockId: string): void {
    this.store.patchBlock(
      blockId,
      { storagePath: undefined, url: '', sizeBytes: undefined, mimeType: undefined },
      'Remove uploaded video',
    );
    this.uploadStatus.set('idle');
    this.uploadError.set(null);
    this.uploadPct.set(0);
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
