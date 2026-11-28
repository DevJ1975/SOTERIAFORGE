import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import {
  type ApiCourseOutline,
  type ApiLesson,
  type ApiLessonSummary,
  type ApiModuleOutline,
  AuthoringApi,
  type LessonInput,
  type LessonUpdate,
  authoringErrorMessage,
} from '@assurance/lms-core';
import { MemberAdminService } from '@assurance/tenant';
import { LessonFormComponent, type PickerOption } from './lesson-form.component';

@Component({
  selector: 'assurance-admin-course-editor',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    CheckboxModule,
    LessonFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="course-editor">
      <nav class="course-editor__nav">
        <a routerLink="/courses">← Back to Courses</a>
      </nav>

      @if (loadError()) {
        <p class="course-editor__error">{{ loadError() }}</p>
      } @else if (loading()) {
        <p>Loading course…</p>
      } @else if (course()) {
        <h1>{{ course()!.title }}</h1>
        <p class="course-editor__status">Status: {{ course()!.status }}</p>
        @if (course()!.description) {
          <p>{{ course()!.description }}</p>
        }
        <div class="course-editor__publish">
          <p-button
            [label]="course()!.status === 'published' ? 'Unpublish' : 'Publish'"
            [severity]="course()!.status === 'published' ? 'secondary' : 'success'"
            [loading]="publishing()"
            (onClick)="togglePublish()"
          />
          @if (publishError()) {
            <p class="course-editor__error">{{ publishError() }}</p>
          }
        </div>

        <!-- Offline availability -->
        <div class="course-editor__offline">
          <h2>Offline access</h2>
          <label class="course-editor__checkbox-label">
            <p-checkbox
              [(ngModel)]="availableOffline"
              [binary]="true"
              inputId="available-offline"
              (onChange)="saveOfflineSetting()"
              [disabled]="savingOffline()"
            />
            Available offline (allow learners to download)
          </label>
          <p class="course-editor__hint">
            Learners can download cacheable content (uploaded media) for offline use. YouTube/Vimeo
            lessons still require a connection.
          </p>
          @if (saveOfflineError()) {
            <p class="course-editor__error">{{ saveOfflineError() }}</p>
          } @else if (offlineSaved()) {
            <p class="course-editor__assign-result" role="status">Offline setting saved.</p>
          }
        </div>

        <!-- Add Module Form -->
        <div class="course-editor__add-module">
          <h2>Add Module</h2>
          <div class="course-editor__add-form">
            <input
              pInputText
              type="text"
              placeholder="Module title"
              [(ngModel)]="newModuleTitle"
              aria-label="Module title"
            />
            <input
              pInputText
              type="text"
              placeholder="Label (optional, e.g. Week 1)"
              [(ngModel)]="newModuleLabel"
              aria-label="Module label"
            />
            <p-button
              label="Add Module"
              [loading]="addingModule()"
              [disabled]="!newModuleTitle.trim()"
              (onClick)="addModule()"
            />
          </div>
        </div>

        @if (structureError()) {
          <p class="course-editor__error">{{ structureError() }}</p>
        }

        <!-- Modules and lessons -->
        <h2>Modules</h2>
        @for (
          m of course()!.modules;
          track m.id;
          let mi = $index;
          let first = $first;
          let last = $last
        ) {
          <div class="course-editor__module">
            <div class="course-editor__module-header">
              <h3>{{ m.title }}</h3>
              @if (m.label) {
                <span class="course-editor__label">{{ m.label }}</span>
              }
              <p-button
                icon="pi pi-arrow-up"
                severity="secondary"
                size="small"
                [text]="true"
                [disabled]="first"
                (onClick)="moveModule(mi, -1)"
                aria-label="Move module up"
              />
              <p-button
                icon="pi pi-arrow-down"
                severity="secondary"
                size="small"
                [text]="true"
                [disabled]="last"
                (onClick)="moveModule(mi, 1)"
                aria-label="Move module down"
              />
              <p-button
                icon="pi pi-trash"
                severity="danger"
                size="small"
                [text]="true"
                (onClick)="deleteModule(m)"
                aria-label="Delete module"
              />
            </div>

            <ul class="course-editor__lessons">
              @for (
                l of m.lessons;
                track l.id;
                let li = $index;
                let lfirst = $first;
                let llast = $last
              ) {
                <li>
                  <div class="course-editor__lesson">
                    <span class="course-editor__lesson-title">{{ li + 1 }}. {{ l.title }}</span>
                    <span class="course-editor__lesson-meta">
                      {{ l.contentType }}
                      @if (l.hasQuiz) {
                        · quiz
                      }
                      @if (l.estimatedMinutes != null) {
                        · {{ l.estimatedMinutes }} min
                      }
                    </span>
                    <p-button
                      icon="pi pi-arrow-up"
                      severity="secondary"
                      size="small"
                      [text]="true"
                      [disabled]="lfirst"
                      (onClick)="moveLesson(m, li, -1)"
                      aria-label="Move lesson up"
                    />
                    <p-button
                      icon="pi pi-arrow-down"
                      severity="secondary"
                      size="small"
                      [text]="true"
                      [disabled]="llast"
                      (onClick)="moveLesson(m, li, 1)"
                      aria-label="Move lesson down"
                    />
                    <p-button
                      label="Edit"
                      severity="secondary"
                      size="small"
                      (onClick)="startEdit(l)"
                    />
                    <p-button
                      icon="pi pi-trash"
                      severity="danger"
                      size="small"
                      [text]="true"
                      (onClick)="deleteLesson(l)"
                      aria-label="Delete lesson"
                    />
                  </div>
                  @if (editingLesson()?.id === l.id) {
                    <assurance-admin-lesson-form
                      [lesson]="editingLesson()"
                      [quizOptions]="quizOptions()"
                      [gameOptions]="gameOptions()"
                      [saving]="savingLesson()"
                      (saved)="saveEdit($event)"
                      (cancelled)="editingLesson.set(null)"
                    />
                  }
                </li>
              } @empty {
                <li class="course-editor__hint">No lessons yet.</li>
              }
            </ul>

            @if (addingLessonFor() === m.id) {
              <assurance-admin-lesson-form
                [quizOptions]="quizOptions()"
                [gameOptions]="gameOptions()"
                [saving]="savingLesson()"
                (saved)="saveNew(m, $event)"
                (cancelled)="addingLessonFor.set(null)"
              />
            } @else {
              <p-button
                label="Add lesson"
                severity="secondary"
                size="small"
                (onClick)="startAdd(m)"
              />
            }
          </div>
        } @empty {
          <p>No modules yet. Add your first module above.</p>
        }
        @if (totalEstimatedMinutes() > 0) {
          <p class="course-editor__total-time">
            Total estimated time: {{ totalEstimatedMinutes() }} min
          </p>
        }

        <!-- Assign to Learners -->
        <div class="course-editor__assign">
          <h2>Assign to Learners</h2>
          @if (course()!.status !== 'published') {
            <p class="course-editor__hint">Publish the course before assigning it.</p>
          }
          @if (membersLoading()) {
            <p>Loading members…</p>
          } @else {
            <div class="course-editor__assign-form">
              <p-multiSelect
                [options]="memberOptions()"
                [(ngModel)]="selectedMemberIds"
                optionLabel="label"
                optionValue="value"
                placeholder="Select learners"
                aria-label="Select learners to assign"
                [style]="{ minWidth: '16rem' }"
              />
              <div class="course-editor__assign-due">
                <label for="assign-due-date">Due date (optional)</label>
                <input
                  id="assign-due-date"
                  type="date"
                  [(ngModel)]="assignDueDate"
                  aria-label="Assignment due date"
                  class="course-editor__date-input"
                />
              </div>
              <p-button
                label="Assign"
                [loading]="assigning()"
                [disabled]="selectedMemberIds.length === 0 || course()!.status !== 'published'"
                (onClick)="assign()"
              />
            </div>
            @if (assignError()) {
              <p class="course-editor__error">{{ assignError() }}</p>
            }
            @if (assignResult()) {
              <p class="course-editor__assign-result">
                Assigned: {{ assignResult()!.assigned }} — Skipped: {{ assignResult()!.skipped }}
              </p>
            }
          }
        </div>
      } @else {
        <p>Course not found.</p>
      }
    </section>
  `,
  styles: [
    `
      .course-editor {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .course-editor__nav {
        margin-bottom: 1rem;
      }
      .course-editor__nav a {
        color: inherit;
        text-decoration: underline;
      }
      .course-editor__publish {
        margin-top: 0.5rem;
      }
      .course-editor__status {
        color: #6b7280;
        font-size: 0.875rem;
        margin-bottom: 0.5rem;
      }
      .course-editor__offline {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-top: 1.5rem;
      }
      .course-editor__checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 44px;
        cursor: pointer;
      }
      .course-editor__hint {
        color: #6b7280;
        font-size: 0.8125rem;
        margin: 0.5rem 0 0;
      }
      .course-editor__add-module {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
        margin-top: 1.5rem;
      }
      .course-editor__add-form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .course-editor__total-time {
        margin-top: 0.75rem;
        font-weight: 600;
        color: #374151;
      }
      .course-editor__module {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1rem;
        margin-bottom: 1rem;
      }
      .course-editor__module-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
      .course-editor__module-header h3 {
        margin: 0;
        margin-right: auto;
      }
      .course-editor__label {
        color: #6b7280;
        font-size: 0.8125rem;
      }
      .course-editor__lessons {
        list-style: none;
        margin: 0.75rem 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .course-editor__lesson {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
      .course-editor__lesson-title {
        margin-right: auto;
      }
      .course-editor__lesson-meta {
        color: #6b7280;
        font-size: 0.8125rem;
      }
      .course-editor__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .course-editor__assign {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-top: 2rem;
      }
      .course-editor__assign-form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .course-editor__assign-due {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .course-editor__assign-due label {
        font-size: 0.8125rem;
        color: #6b7280;
      }
      .course-editor__date-input {
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        font-size: 0.875rem;
      }
      .course-editor__assign-result {
        color: #15803d;
        margin-top: 0.5rem;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class CourseEditorComponent implements OnInit {
  /** Route param injected via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly api = inject(AuthoringApi);
  private readonly members = inject(MemberAdminService);

  protected readonly course = signal<ApiCourseOutline | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly publishing = signal(false);
  protected readonly publishError = signal<string | null>(null);

  // Offline availability (MO-07)
  protected availableOffline = false;
  protected readonly savingOffline = signal(false);
  protected readonly saveOfflineError = signal<string | null>(null);
  protected readonly offlineSaved = signal(false);

  /** Course-level total estimated time (MO-14): sum of lesson minutes. */
  protected readonly totalEstimatedMinutes = computed(() =>
    (this.course()?.modules ?? [])
      .flatMap((m) => m.lessons)
      .reduce((sum, l) => sum + (l.estimatedMinutes ?? 0), 0),
  );

  protected readonly quizOptions = signal<PickerOption[]>([]);
  protected readonly gameOptions = signal<PickerOption[]>([]);

  protected newModuleTitle = '';
  protected newModuleLabel = '';
  protected readonly addingModule = signal(false);
  protected readonly structureError = signal<string | null>(null);

  protected readonly addingLessonFor = signal<string | null>(null);
  protected readonly editingLesson = signal<ApiLesson | null>(null);
  protected readonly savingLesson = signal(false);

  // Assignment state
  protected readonly memberOptions = signal<PickerOption[]>([]);
  protected readonly membersLoading = signal(false);
  protected selectedMemberIds: string[] = [];
  protected assignDueDate = '';
  protected readonly assigning = signal(false);
  protected readonly assignError = signal<string | null>(null);
  protected readonly assignResult = signal<{ assigned: number; skipped: number } | null>(null);

  constructor() {
    effect(() => {
      const courseId = this.id();
      if (courseId) {
        void this.loadCourse(courseId);
      }
    });
  }

  ngOnInit(): void {
    // effect() in constructor already handles initial load
  }

  private async loadCourse(courseId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const c = await this.api.course(courseId);
      this.course.set(c);
      this.availableOffline = c.availableOffline;
    } catch (err) {
      this.loadError.set(authoringErrorMessage(err, 'Failed to load course'));
      return;
    } finally {
      this.loading.set(false);
    }
    // The pickers are conveniences: a failure leaves them empty instead of blocking the editor.
    void this.loadPickers();
    void this.loadMembers();
  }

  private async loadPickers(): Promise<void> {
    const [quizzes, games] = await Promise.all([
      this.api.quizzes().catch(() => []),
      this.api.games().catch(() => []),
    ]);
    this.quizOptions.set(quizzes.map((q) => ({ label: q.title, value: q.id })));
    this.gameOptions.set(games.map((g) => ({ label: g.title, value: g.id })));
  }

  private async loadMembers(): Promise<void> {
    this.membersLoading.set(true);
    try {
      const list = await this.members.listMembers();
      this.memberOptions.set(
        list
          .filter((m) => m.status === 'active')
          .map((m) => ({ label: m.displayName || m.email, value: m.id })),
      );
    } catch {
      // Non-fatal: assignment section just shows an empty list
      this.memberOptions.set([]);
    } finally {
      this.membersLoading.set(false);
    }
  }

  /** Re-reads the outline after a structure change. */
  private async refresh(): Promise<void> {
    this.course.set(await this.api.course(this.id()));
  }

  /** Runs a structure change, then reloads; failures land in `structureError`. */
  private async mutate(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    this.structureError.set(null);
    try {
      await action();
      await this.refresh();
      return true;
    } catch (err) {
      this.structureError.set(authoringErrorMessage(err, fallback));
      return false;
    }
  }

  protected async togglePublish(): Promise<void> {
    const current = this.course();
    if (!current) return;
    this.publishing.set(true);
    this.publishError.set(null);
    try {
      const updated =
        current.status === 'published'
          ? await this.api.unpublish(current.id)
          : await this.api.publish(current.id);
      this.course.set({ ...current, status: updated.status });
    } catch (err) {
      this.publishError.set(authoringErrorMessage(err, 'Failed to change publish status'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected async addModule(): Promise<void> {
    const current = this.course();
    const title = this.newModuleTitle.trim();
    if (!current || !title) return;
    this.addingModule.set(true);
    const done = await this.mutate(
      () =>
        this.api.addModule(current.id, {
          title,
          label: this.newModuleLabel.trim(),
          order: current.modules.length,
        }),
      'Failed to add module',
    );
    if (done) {
      this.newModuleTitle = '';
      this.newModuleLabel = '';
    }
    this.addingModule.set(false);
  }

  protected async deleteModule(m: ApiModuleOutline): Promise<void> {
    await this.mutate(() => this.api.deleteModule(m.id), 'Failed to delete module');
  }

  protected async moveModule(index: number, delta: -1 | 1): Promise<void> {
    const ids = swap(
      (this.course()?.modules ?? []).map((m) => m.id),
      index,
      index + delta,
    );
    if (ids) await this.mutate(() => this.api.reorderModules(ids), 'Failed to reorder modules');
  }

  protected startAdd(m: ApiModuleOutline): void {
    this.editingLesson.set(null);
    this.addingLessonFor.set(m.id);
  }

  protected async startEdit(l: ApiLessonSummary): Promise<void> {
    this.addingLessonFor.set(null);
    this.structureError.set(null);
    try {
      this.editingLesson.set(await this.api.lesson(l.id));
    } catch (err) {
      this.structureError.set(authoringErrorMessage(err, 'Failed to load lesson'));
    }
  }

  protected async saveNew(m: ApiModuleOutline, update: LessonUpdate): Promise<void> {
    this.savingLesson.set(true);
    const done = await this.mutate(
      () =>
        this.api.addLesson(m.id, {
          ...(update as LessonInput),
          order: m.lessons.length,
        }),
      'Failed to add lesson',
    );
    if (done) this.addingLessonFor.set(null);
    this.savingLesson.set(false);
  }

  protected async saveEdit(update: LessonUpdate): Promise<void> {
    const lesson = this.editingLesson();
    if (!lesson) return;
    this.savingLesson.set(true);
    const done = await this.mutate(
      () => this.api.updateLesson(lesson.id, update),
      'Failed to save lesson',
    );
    if (done) this.editingLesson.set(null);
    this.savingLesson.set(false);
  }

  protected async deleteLesson(l: ApiLessonSummary): Promise<void> {
    await this.mutate(() => this.api.deleteLesson(l.id), 'Failed to delete lesson');
  }

  protected async moveLesson(m: ApiModuleOutline, index: number, delta: -1 | 1): Promise<void> {
    const ids = swap(
      m.lessons.map((l) => l.id),
      index,
      index + delta,
    );
    if (ids) await this.mutate(() => this.api.reorderLessons(ids), 'Failed to reorder lessons');
  }

  /** Persist the `availableOffline` author opt-in (MO-07). */
  protected async saveOfflineSetting(): Promise<void> {
    const current = this.course();
    if (!current) return;
    this.savingOffline.set(true);
    this.saveOfflineError.set(null);
    this.offlineSaved.set(false);
    try {
      await this.api.updateCourse(current.id, { availableOffline: this.availableOffline });
      this.course.set({ ...current, availableOffline: this.availableOffline });
      this.offlineSaved.set(true);
    } catch (err) {
      // Revert the toggle to the persisted value on failure.
      this.availableOffline = current.availableOffline;
      this.saveOfflineError.set(authoringErrorMessage(err, 'Failed to save offline setting'));
    } finally {
      this.savingOffline.set(false);
    }
  }

  protected async assign(): Promise<void> {
    const courseId = this.id();
    if (!courseId || this.selectedMemberIds.length === 0) return;
    this.assigning.set(true);
    this.assignError.set(null);
    this.assignResult.set(null);
    try {
      const dueAt = this.assignDueDate ? new Date(this.assignDueDate).toISOString() : undefined;
      this.assignResult.set(
        await this.api.assign(courseId, { memberIds: this.selectedMemberIds, dueAt }),
      );
      this.selectedMemberIds = [];
      this.assignDueDate = '';
    } catch (err) {
      this.assignError.set(authoringErrorMessage(err, 'Failed to assign course'));
    } finally {
      this.assigning.set(false);
    }
  }
}

/** The ids with positions `a` and `b` swapped, or null when `b` is off the end. */
function swap(ids: string[], a: number, b: number): string[] | null {
  if (b < 0 || b >= ids.length || a < 0 || a >= ids.length) return null;
  const next = [...ids];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
