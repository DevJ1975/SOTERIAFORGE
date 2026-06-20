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
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { CourseAuthoringService, AssignmentService } from '@assurance/lms-core';
import {
  CourseRepository,
  GameRepository,
  MemberRepository,
  ModuleRepository,
  QuizRepository,
} from '@assurance/data-access';
import { TenantService } from '@assurance/auth';
import {
  CONTENT_TYPES,
  type ContentType,
  type Course,
  type Member,
  type Module,
} from '@assurance/shared';
import type { Game, Quiz } from '@assurance/shared';

interface QuizOption {
  label: string;
  value: string;
}

interface GameOption {
  label: string;
  value: string;
}

interface MemberOption {
  label: string;
  value: string;
}

@Component({
  selector: 'assurance-admin-course-editor',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    TableModule,
    SelectModule,
    MultiSelectModule,
    CheckboxModule,
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
            Learners can download cacheable content (uploaded/Storage media) for offline use.
            YouTube/Vimeo modules still require a connection.
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
            <p-select
              [options]="contentTypeOptions"
              [(ngModel)]="newContentType"
              placeholder="Content type"
              aria-label="Content type"
            />
            @if (newContentType === 'quiz') {
              <p-select
                [options]="quizOptions()"
                [(ngModel)]="newQuizRef"
                placeholder="Select quiz"
                aria-label="Select quiz"
              />
            } @else if (newContentType === 'game') {
              <p-select
                [options]="gameOptions()"
                [(ngModel)]="newGameRef"
                placeholder="Select game"
                aria-label="Select game"
              />
            } @else {
              <input
                pInputText
                type="text"
                placeholder="Video URL or asset ref (optional)"
                [(ngModel)]="newExternalUrl"
                aria-label="Video URL or asset ref"
              />
            }
            <input
              pInputText
              type="number"
              min="0"
              step="1"
              placeholder="Est. minutes"
              [(ngModel)]="newEstimatedMinutes"
              aria-label="Estimated minutes to complete"
              class="course-editor__minutes-input"
            />
            <p-button
              label="Add Module"
              [loading]="addingModule()"
              [disabled]="!newModuleTitle.trim() || !newContentType"
              (onClick)="addModule()"
            />
          </div>
          @if (addModuleError()) {
            <p class="course-editor__error">{{ addModuleError() }}</p>
          }
        </div>

        <!-- Modules List -->
        <h2>Modules</h2>
        @if (modulesLoading()) {
          <p>Loading modules…</p>
        } @else if (modulesError()) {
          <p class="course-editor__error">{{ modulesError() }}</p>
        } @else {
          <p-table
            [value]="modules()"
            [paginator]="modules().length > 10"
            [rows]="10"
            styleClass="p-datatable-sm"
          >
            <ng-template pTemplate="header">
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Type</th>
                <th>URL / Asset</th>
                <th>Est. min</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-m>
              <tr>
                <td>{{ m.order + 1 }}</td>
                <td>{{ m.title }}</td>
                <td>{{ m.contentType }}</td>
                <td>{{ m.externalUrl ?? m.assetRef ?? '—' }}</td>
                <td>{{ m.estimatedMinutes != null ? m.estimatedMinutes : '—' }}</td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr>
                <td colspan="5">No modules yet. Add your first module above.</td>
              </tr>
            </ng-template>
          </p-table>
          @if (totalEstimatedMinutes() > 0) {
            <p class="course-editor__total-time">
              Total estimated time: {{ totalEstimatedMinutes() }} min
            </p>
          }
        }

        <!-- Assign to Learners -->
        <div class="course-editor__assign">
          <h2>Assign to Learners</h2>
          @if (membersLoading()) {
            <p>Loading members…</p>
          } @else {
            <div class="course-editor__assign-form">
              <p-multiSelect
                [options]="memberOptions()"
                [(ngModel)]="selectedUids"
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
                [disabled]="selectedUids.length === 0"
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
      .course-editor__minutes-input {
        width: 8rem;
      }
      .course-editor__total-time {
        margin-top: 0.75rem;
        font-weight: 600;
        color: #374151;
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

  private readonly courseRepo = inject(CourseRepository);
  private readonly moduleRepo = inject(ModuleRepository);
  private readonly quizRepo = inject(QuizRepository);
  private readonly gameRepo = inject(GameRepository);
  private readonly memberRepo = inject(MemberRepository);
  private readonly authoringService = inject(CourseAuthoringService);
  private readonly assignmentService = inject(AssignmentService);
  private readonly tenantService = inject(TenantService);

  protected readonly contentTypeOptions = CONTENT_TYPES.map((t) => ({ label: t, value: t }));

  protected readonly course = signal<Course | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  // Offline availability (MO-07)
  protected availableOffline = false;
  protected readonly savingOffline = signal(false);
  protected readonly saveOfflineError = signal<string | null>(null);
  protected readonly offlineSaved = signal(false);

  protected readonly modules = signal<Module[]>([]);
  protected readonly modulesLoading = signal(false);
  protected readonly modulesError = signal<string | null>(null);

  /** Course-level total estimated time (MO-14): sum of module minutes. */
  protected readonly totalEstimatedMinutes = computed(() =>
    this.modules().reduce((sum, m) => sum + (m.estimatedMinutes ?? 0), 0),
  );

  protected readonly quizOptions = signal<QuizOption[]>([]);
  protected readonly gameOptions = signal<GameOption[]>([]);

  protected newModuleTitle = '';
  protected newContentType: ContentType | null = null;
  protected newExternalUrl = '';
  protected newQuizRef = '';
  protected newGameRef = '';
  /** Optional author-estimated minutes for the new module (MO-14). */
  protected newEstimatedMinutes: number | null = null;
  protected readonly addingModule = signal(false);
  protected readonly addModuleError = signal<string | null>(null);

  // Assignment state
  protected readonly memberOptions = signal<MemberOption[]>([]);
  protected readonly membersLoading = signal(false);
  protected selectedUids: string[] = [];
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
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [c, quizList, gameList] = await Promise.all([
        this.courseRepo.getById(tid, courseId),
        this.quizRepo.list(tid),
        this.gameRepo.list(tid),
      ]);
      this.course.set(c);
      this.availableOffline = c?.availableOffline ?? false;
      this.quizOptions.set((quizList as Quiz[]).map((q) => ({ label: q.title, value: q.id })));
      this.gameOptions.set((gameList as Game[]).map((g) => ({ label: g.title, value: g.id })));
      await Promise.all([this.loadModules(tid, courseId), this.loadMembers(tid)]);
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load course');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadModules(tenantId: string, courseId: string): Promise<void> {
    this.modulesLoading.set(true);
    this.modulesError.set(null);
    try {
      const list = await this.moduleRepo.listOrdered(tenantId, courseId);
      this.modules.set(list);
    } catch (err) {
      this.modulesError.set((err as Error).message ?? 'Failed to load modules');
    } finally {
      this.modulesLoading.set(false);
    }
  }

  private async loadMembers(tenantId: string): Promise<void> {
    this.membersLoading.set(true);
    try {
      const members: Member[] = await this.memberRepo.listActive(tenantId);
      this.memberOptions.set(
        members.map((m) => ({
          label: m.displayName ?? m.email,
          value: m.uid,
        })),
      );
    } catch {
      // Non-fatal: assignment section just shows empty list
      this.memberOptions.set([]);
    } finally {
      this.membersLoading.set(false);
    }
  }

  protected async addModule(): Promise<void> {
    const tid = this.tenantService.tenantId();
    const courseId = this.id();
    if (!tid || !courseId || !this.newModuleTitle.trim() || !this.newContentType) return;
    this.addingModule.set(true);
    this.addModuleError.set(null);
    try {
      const isQuiz = this.newContentType === 'quiz';
      const isGame = this.newContentType === 'game';
      await this.authoringService.addModule({
        tenantId: tid,
        courseId,
        title: this.newModuleTitle.trim(),
        contentType: this.newContentType,
        assetRef:
          isQuiz && this.newQuizRef
            ? this.newQuizRef
            : isGame && this.newGameRef
              ? this.newGameRef
              : undefined,
        externalUrl:
          !isQuiz && !isGame && this.newExternalUrl.trim() ? this.newExternalUrl.trim() : undefined,
        estimatedMinutes:
          this.newEstimatedMinutes != null && this.newEstimatedMinutes >= 0
            ? Math.floor(this.newEstimatedMinutes)
            : undefined,
      });
      this.newModuleTitle = '';
      this.newContentType = null;
      this.newExternalUrl = '';
      this.newQuizRef = '';
      this.newGameRef = '';
      this.newEstimatedMinutes = null;
      await this.loadModules(tid, courseId);
    } catch (err) {
      this.addModuleError.set((err as Error).message ?? 'Failed to add module');
    } finally {
      this.addingModule.set(false);
    }
  }

  /** Persist the `availableOffline` author opt-in (MO-07). */
  protected async saveOfflineSetting(): Promise<void> {
    const tid = this.tenantService.tenantId();
    const current = this.course();
    if (!tid || !current) return;
    this.savingOffline.set(true);
    this.saveOfflineError.set(null);
    this.offlineSaved.set(false);
    try {
      const updated: Course = { ...current, availableOffline: this.availableOffline };
      await this.courseRepo.set(tid, updated);
      this.course.set(updated);
      this.offlineSaved.set(true);
    } catch (err) {
      // Revert the toggle to the persisted value on failure.
      this.availableOffline = current.availableOffline ?? false;
      this.saveOfflineError.set((err as Error).message ?? 'Failed to save offline setting');
    } finally {
      this.savingOffline.set(false);
    }
  }

  protected async assign(): Promise<void> {
    const tid = this.tenantService.tenantId();
    const courseId = this.id();
    if (!tid || !courseId || this.selectedUids.length === 0) return;
    this.assigning.set(true);
    this.assignError.set(null);
    this.assignResult.set(null);
    try {
      const dueAt = this.assignDueDate ? new Date(this.assignDueDate).toISOString() : undefined;
      const result = await this.assignmentService.assign({
        tenantId: tid,
        courseId,
        uids: this.selectedUids,
        dueAt,
      });
      this.assignResult.set(result);
      this.selectedUids = [];
      this.assignDueDate = '';
    } catch (err) {
      this.assignError.set((err as Error).message ?? 'Failed to assign course');
    } finally {
      this.assigning.set(false);
    }
  }
}
