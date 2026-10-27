import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import type { ApiCourseOutline, ContentType } from '@assurance/lms-core';
import { apiErrorMessage } from '../services/api-error';
import { LibraryService } from '../services/library.service';

const CONTENT_TYPES: ContentType[] = ['video', 'scorm', 'cmi5', 'quiz', 'game', 'unity'];
const STATUSES = ['draft', 'published', 'archived'] as const;

@Component({
  selector: 'assurance-superadmin-library-editor',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="library-editor">
      @if (loading() && !course()) {
        <p>Loading course…</p>
      } @else if (loadError()) {
        <p class="library-editor__error">{{ loadError() }}</p>
      } @else if (course()) {
        <h1>{{ course()!.title }}</h1>

        <p-card header="Course details" styleClass="library-editor__form-card">
          <div class="library-editor__form">
            <input
              pInputText
              type="text"
              placeholder="Title"
              [(ngModel)]="title"
              class="library-editor__field--wide"
            />
            <input
              pInputText
              type="text"
              placeholder="Description"
              [(ngModel)]="description"
              class="library-editor__field--wide"
            />
            <p-select [options]="statusOptions" [(ngModel)]="status" />
            <p-button
              label="Save details"
              [loading]="saving()"
              [disabled]="!title"
              (onClick)="saveDetails()"
            />
          </div>
        </p-card>

        <p-card header="Add Module" styleClass="library-editor__form-card">
          <div class="library-editor__form">
            <input pInputText type="text" placeholder="Module title" [(ngModel)]="newModuleTitle" />
            <input
              pInputText
              type="text"
              placeholder="Label (optional)"
              [(ngModel)]="newModuleLabel"
            />
            <p-button
              label="Add Module"
              [loading]="saving()"
              [disabled]="!newModuleTitle"
              (onClick)="addModule()"
            />
          </div>
        </p-card>

        @if (saveError()) {
          <p class="library-editor__error">{{ saveError() }}</p>
        }

        @for (m of course()!.modules; track m.id) {
          <p-card [header]="m.order + 1 + '. ' + m.title">
            @if (m.lessons.length === 0) {
              <p>No lessons yet.</p>
            }
            <ul class="library-editor__lessons">
              @for (l of m.lessons; track l.id) {
                <li>
                  <span>{{ l.title }} ({{ l.contentType }})</span>
                  <p-button
                    label="Delete"
                    size="small"
                    severity="danger"
                    [text]="true"
                    [disabled]="saving()"
                    (onClick)="deleteLesson(l.id)"
                  />
                </li>
              }
            </ul>
            <div class="library-editor__form">
              <input
                pInputText
                type="text"
                placeholder="Lesson title"
                [ngModel]="draft(m.id).title"
                (ngModelChange)="setDraft(m.id, 'title', $event)"
              />
              <p-select
                [options]="contentTypeOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Content type"
                [ngModel]="draft(m.id).contentType"
                (ngModelChange)="setDraft(m.id, 'contentType', $event)"
              />
              <input
                pInputText
                type="text"
                placeholder="External URL (optional)"
                [ngModel]="draft(m.id).externalUrl"
                (ngModelChange)="setDraft(m.id, 'externalUrl', $event)"
              />
              <input
                pInputText
                type="text"
                placeholder="Asset reference, e.g. asset:ID (optional)"
                [ngModel]="draft(m.id).assetRef"
                (ngModelChange)="setDraft(m.id, 'assetRef', $event)"
              />
              <p-button
                label="Add Lesson"
                [loading]="saving()"
                [disabled]="!draft(m.id).title || !draft(m.id).contentType"
                (onClick)="addLesson(m.id)"
              />
              <p-button
                label="Delete module"
                severity="danger"
                [outlined]="true"
                [disabled]="saving()"
                (onClick)="deleteModule(m.id)"
              />
            </div>
          </p-card>
        } @empty {
          <p>No modules yet. Add the first module above.</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .library-editor {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .library-editor__form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-start;
      }
      .library-editor__field--wide {
        width: 100%;
        min-width: 20rem;
      }
      .library-editor__lessons {
        list-style: none;
        padding: 0;
        margin: 0 0 1rem;
      }
      .library-editor__lessons li {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .library-editor__error {
        color: #b00020;
        margin-top: 0.25rem;
      }
    `,
  ],
})
export class LibraryEditorComponent implements OnInit {
  readonly id = input.required<string>();

  private readonly library = inject(LibraryService);

  protected readonly course = signal<ApiCourseOutline | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  private readonly drafts = signal<Record<string, LessonDraft>>({});

  protected title = '';
  protected description = '';
  protected status: (typeof STATUSES)[number] = 'draft';
  protected newModuleTitle = '';
  protected newModuleLabel = '';

  protected readonly statusOptions = [...STATUSES];
  protected readonly contentTypeOptions = CONTENT_TYPES.map((ct) => ({
    label: ct.charAt(0).toUpperCase() + ct.slice(1),
    value: ct,
  }));

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const c = await this.library.course(this.id());
      this.course.set(c);
      this.title = c.title;
      this.description = c.description;
      this.status = c.status;
    } catch (err) {
      this.loadError.set(apiErrorMessage(err, 'Failed to load course'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Runs a write, then reloads the outline; shows the API's message on failure. */
  private async mutate(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await action();
      await this.load();
      return true;
    } catch (err) {
      this.saveError.set(apiErrorMessage(err, fallback));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected saveDetails(): Promise<boolean> {
    return this.mutate(
      () =>
        this.library.updateCourse(this.id(), {
          title: this.title,
          description: this.description,
          status: this.status,
        }),
      'Failed to save the course',
    );
  }

  protected async addModule(): Promise<void> {
    const ok = await this.mutate(
      () =>
        this.library.addModule(this.id(), {
          title: this.newModuleTitle,
          label: this.newModuleLabel || undefined,
        }),
      'Failed to add module',
    );
    if (ok) {
      this.newModuleTitle = '';
      this.newModuleLabel = '';
    }
  }

  protected deleteModule(moduleId: string): Promise<boolean> {
    return this.mutate(() => this.library.deleteModule(moduleId), 'Failed to delete module');
  }

  protected draft(moduleId: string): LessonDraft {
    return this.drafts()[moduleId] ?? EMPTY_DRAFT;
  }

  protected setDraft<K extends keyof LessonDraft>(
    moduleId: string,
    key: K,
    value: LessonDraft[K],
  ): void {
    this.drafts.update((d) => ({ ...d, [moduleId]: { ...this.draft(moduleId), [key]: value } }));
  }

  protected async addLesson(moduleId: string): Promise<void> {
    const d = this.draft(moduleId);
    if (!d.title || !d.contentType) return;
    const ok = await this.mutate(
      () =>
        this.library.addLesson(moduleId, {
          title: d.title,
          contentType: d.contentType as ContentType,
          ...(d.externalUrl ? { externalUrl: d.externalUrl } : {}),
          ...(d.assetRef ? { assetRef: d.assetRef } : {}),
        }),
      'Failed to add lesson',
    );
    if (ok) this.drafts.update((all) => ({ ...all, [moduleId]: EMPTY_DRAFT }));
  }

  protected deleteLesson(lessonId: string): Promise<boolean> {
    return this.mutate(() => this.library.deleteLesson(lessonId), 'Failed to delete lesson');
  }
}

interface LessonDraft {
  title: string;
  contentType: ContentType | '';
  externalUrl: string;
  assetRef: string;
}

const EMPTY_DRAFT: LessonDraft = { title: '', contentType: '', externalUrl: '', assetRef: '' };
