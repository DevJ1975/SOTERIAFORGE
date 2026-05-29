import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
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
import { CourseAuthoringService } from '@forge/lms-core';
import {
  CourseRepository,
  GameRepository,
  ModuleRepository,
  QuizRepository,
} from '@forge/data-access';
import { TenantService } from '@forge/auth';
import { CONTENT_TYPES, type ContentType, type Course, type Module } from '@forge/shared';
import type { Game, Quiz } from '@forge/shared';

interface QuizOption {
  label: string;
  value: string;
}

interface GameOption {
  label: string;
  value: string;
}

@Component({
  selector: 'forge-admin-course-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, TableModule, SelectModule],
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
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-m>
              <tr>
                <td>{{ m.order + 1 }}</td>
                <td>{{ m.title }}</td>
                <td>{{ m.contentType }}</td>
                <td>{{ m.externalUrl ?? m.assetRef ?? '—' }}</td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr>
                <td colspan="4">No modules yet. Add your first module above.</td>
              </tr>
            </ng-template>
          </p-table>
        }
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
      .course-editor__add-module {
        background: var(--forge-color-surface, #fff);
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
      .course-editor__error {
        color: #b00020;
        margin-top: 0.5rem;
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
  private readonly authoringService = inject(CourseAuthoringService);
  private readonly tenantService = inject(TenantService);

  protected readonly contentTypeOptions = CONTENT_TYPES.map((t) => ({ label: t, value: t }));

  protected readonly course = signal<Course | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly modules = signal<Module[]>([]);
  protected readonly modulesLoading = signal(false);
  protected readonly modulesError = signal<string | null>(null);

  protected readonly quizOptions = signal<QuizOption[]>([]);
  protected readonly gameOptions = signal<GameOption[]>([]);

  protected newModuleTitle = '';
  protected newContentType: ContentType | null = null;
  protected newExternalUrl = '';
  protected newQuizRef = '';
  protected newGameRef = '';
  protected readonly addingModule = signal(false);
  protected readonly addModuleError = signal<string | null>(null);

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
      this.quizOptions.set((quizList as Quiz[]).map((q) => ({ label: q.title, value: q.id })));
      this.gameOptions.set((gameList as Game[]).map((g) => ({ label: g.title, value: g.id })));
      await this.loadModules(tid, courseId);
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
      });
      this.newModuleTitle = '';
      this.newContentType = null;
      this.newExternalUrl = '';
      this.newQuizRef = '';
      this.newGameRef = '';
      await this.loadModules(tid, courseId);
    } catch (err) {
      this.addModuleError.set((err as Error).message ?? 'Failed to add module');
    } finally {
      this.addingModule.set(false);
    }
  }
}
