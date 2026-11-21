import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import {
  type ApiLesson,
  AuthoringApi,
  type KeyPoint,
  type LessonUpdate,
  authoringErrorMessage,
} from '@assurance/lms-core';
import { CONTENT_TYPES, type ContentType } from '@assurance/shared';

export interface PickerOption {
  label: string;
  value: string;
}

/**
 * Add/edit form for one lesson. Emits the API write shape; the parent saves it
 * so list state stays in one place. Package (SCORM/cmi5) lessons have immutable
 * content on the server, so only their metadata is editable here.
 */
@Component({
  selector: 'assurance-admin-lesson-form',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lesson-form">
      <div class="lesson-form__row">
        <input
          pInputText
          type="text"
          placeholder="Lesson title"
          [(ngModel)]="title"
          aria-label="Lesson title"
        />
        @if (!locked) {
          <p-select
            [options]="contentTypeOptions"
            [(ngModel)]="contentType"
            placeholder="Content type"
            aria-label="Content type"
          />
        }
        <input
          pInputText
          type="number"
          min="0"
          step="1"
          placeholder="Est. minutes"
          [(ngModel)]="estimatedMinutes"
          aria-label="Estimated minutes to complete"
          class="lesson-form__small"
        />
        <input
          pInputText
          type="number"
          min="0"
          max="1000"
          step="1"
          placeholder="XP"
          [(ngModel)]="xpReward"
          aria-label="XP reward"
          class="lesson-form__small"
        />
      </div>

      @if (!locked) {
        <div class="lesson-form__row">
          @if (contentType === 'game') {
            <p-select
              [options]="gameOptions()"
              [(ngModel)]="gameId"
              placeholder="Select game"
              aria-label="Select game"
            />
          } @else if (contentType === 'quiz') {
            <p class="lesson-form__hint">Pick the quiz below.</p>
          } @else {
            <input
              pInputText
              type="text"
              placeholder="External URL (https://…)"
              [(ngModel)]="externalUrl"
              aria-label="External URL"
            />
            <input
              pInputText
              type="text"
              placeholder="Asset ref (asset:…)"
              [(ngModel)]="assetRef"
              aria-label="Asset ref"
            />
            @if (contentType === 'video') {
              <label class="lesson-form__upload">
                Upload video
                <input
                  type="file"
                  accept="video/*"
                  (change)="upload($event)"
                  aria-label="Upload video file"
                />
              </label>
            }
          }
        </div>
        <div class="lesson-form__row">
          <p-select
            [options]="quizOptions()"
            [(ngModel)]="quizId"
            [showClear]="contentType !== 'quiz'"
            [placeholder]="
              contentType === 'quiz' ? 'Select quiz' : 'Knowledge-check quiz (optional)'
            "
            aria-label="Select quiz"
          />
        </div>
      }

      <div class="lesson-form__row">
        <input
          pInputText
          type="text"
          placeholder="Framework tags (comma separated)"
          [(ngModel)]="frameworkTags"
          aria-label="Framework tags"
        />
      </div>

      <div class="lesson-form__keypoints">
        <strong>Key points</strong>
        @for (kp of keyPoints(); track $index; let i = $index) {
          <div class="lesson-form__row">
            <input
              pInputText
              type="text"
              placeholder="Title"
              [ngModel]="kp.title"
              (ngModelChange)="setKeyPoint(i, 'title', $event)"
              [attr.aria-label]="'Key point ' + (i + 1) + ' title'"
            />
            <input
              pInputText
              type="text"
              placeholder="Detail"
              [ngModel]="kp.body"
              (ngModelChange)="setKeyPoint(i, 'body', $event)"
              [attr.aria-label]="'Key point ' + (i + 1) + ' detail'"
            />
            <p-button
              icon="pi pi-times"
              severity="danger"
              size="small"
              [text]="true"
              (onClick)="removeKeyPoint(i)"
              aria-label="Remove key point"
            />
          </div>
        }
        <p-button
          label="Add key point"
          severity="secondary"
          size="small"
          (onClick)="addKeyPoint()"
        />
      </div>

      @if (error()) {
        <p class="lesson-form__error">{{ error() }}</p>
      }
      <div class="lesson-form__row">
        <p-button
          [label]="lesson() ? 'Save lesson' : 'Add lesson'"
          [loading]="busy()"
          [disabled]="!canSave()"
          (onClick)="save()"
        />
        <p-button label="Cancel" severity="secondary" (onClick)="cancelled.emit()" />
      </div>
    </div>
  `,
  styles: [
    `
      .lesson-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.75rem;
        border: 1px dashed #d1d5db;
        border-radius: 0.5rem;
      }
      .lesson-form__row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }
      .lesson-form__small {
        width: 7rem;
      }
      .lesson-form__keypoints {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .lesson-form__hint {
        color: #6b7280;
        font-size: 0.8125rem;
        margin: 0;
      }
      .lesson-form__upload {
        display: flex;
        flex-direction: column;
        font-size: 0.8125rem;
        color: #6b7280;
      }
      .lesson-form__error {
        color: #b00020;
        margin: 0;
      }
    `,
  ],
})
export class LessonFormComponent implements OnInit {
  /** The lesson being edited, or null to add a new one. */
  readonly lesson = input<ApiLesson | null>(null);
  readonly quizOptions = input<PickerOption[]>([]);
  readonly gameOptions = input<PickerOption[]>([]);
  /** Set while the parent is saving. */
  readonly saving = input(false);

  /** Full payload for a new lesson; metadata only for a package lesson. */
  readonly saved = output<LessonUpdate>();
  readonly cancelled = output<void>();

  private readonly api = inject(AuthoringApi);

  protected readonly contentTypeOptions = CONTENT_TYPES.map((t) => ({ label: t, value: t }));
  protected readonly keyPoints = signal<KeyPoint[]>([]);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected title = '';
  protected contentType: ContentType = 'video';
  protected externalUrl = '';
  protected assetRef = '';
  protected gameId: string | null = null;
  protected quizId: string | null = null;
  protected estimatedMinutes: number | null = null;
  protected xpReward: number | null = null;
  protected frameworkTags = '';
  protected locked = false;

  protected busy(): boolean {
    return this.saving() || this.uploading();
  }

  ngOnInit(): void {
    const l = this.lesson();
    if (!l) return;
    this.title = l.title;
    this.contentType = l.contentType;
    this.externalUrl = l.externalUrl;
    this.assetRef = l.contentType === 'game' ? '' : l.assetRef;
    this.gameId = l.contentType === 'game' ? l.assetRef || null : null;
    this.quizId = l.quiz?.id ?? null;
    this.estimatedMinutes = l.estimatedMinutes;
    this.xpReward = l.xpReward;
    this.frameworkTags = l.frameworkTags.join(', ');
    this.keyPoints.set(l.keyPoints.map((k) => ({ title: k.title, body: k.body ?? '' })));
    this.locked = l.standardsManaged === true;
  }

  protected canSave(): boolean {
    if (this.busy() || !this.title.trim()) return false;
    if (this.locked) return true;
    if (this.contentType === 'quiz') return !!this.quizId;
    if (this.contentType === 'game') return !!this.gameId;
    return true;
  }

  protected addKeyPoint(): void {
    this.keyPoints.update((list) => [...list, { title: '', body: '' }]);
  }

  protected removeKeyPoint(index: number): void {
    this.keyPoints.update((list) => list.filter((_, i) => i !== index));
  }

  protected setKeyPoint(index: number, field: keyof KeyPoint, value: string): void {
    this.keyPoints.update((list) =>
      list.map((k, i) => (i === index ? { ...k, [field]: value } : k)),
    );
  }

  protected async upload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const asset = await this.api.uploadAsset(file, file.name);
      this.assetRef = asset.assetRef;
      // The player prefers the external URL, so the upload only wins when it is cleared.
      this.externalUrl = '';
    } catch (err) {
      this.error.set(authoringErrorMessage(err, 'Upload failed'));
    } finally {
      this.uploading.set(false);
    }
  }

  protected save(): void {
    if (!this.canSave()) return;
    const input: LessonUpdate = {
      title: this.title.trim(),
      estimatedMinutes:
        this.estimatedMinutes != null && this.estimatedMinutes >= 0
          ? Math.floor(this.estimatedMinutes)
          : null,
      xpReward: this.xpReward != null && this.xpReward >= 0 ? Math.floor(this.xpReward) : 0,
      frameworkTags: this.frameworkTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      keyPoints: this.keyPoints().filter((k) => k.title.trim()),
    };
    // Package content is immutable server-side, so a locked lesson sends metadata only.
    if (!this.locked) {
      input.contentType = this.contentType;
      input.quizId = this.quizId || null;
      if (this.contentType === 'game') {
        input.assetRef = this.gameId ?? '';
        input.externalUrl = '';
      } else if (this.contentType === 'quiz') {
        input.assetRef = '';
        input.externalUrl = '';
      } else {
        input.assetRef = this.assetRef.trim();
        input.externalUrl = this.externalUrl.trim();
      }
    }
    this.saved.emit(input);
  }
}
